const axios = require('axios');
const { config } = require('dotenv');
const Redis = require('ioredis');
const mysql = require('mysql2/promise');

// Load environment variables
config();

// API base URL
const API_BASE_URL = 'http://localhost:3019/api';

class TranslationKeyManager {
  constructor(baseUrl = API_BASE_URL) {
    this.baseUrl = baseUrl;
  }

  async setKeyStatus(key, code, note = '') {
    try {
      const response = await axios.post(`${this.baseUrl}/translation/keys/status`, {
        key,
        code,
        note
      });
      return response.data;
    } catch (error) {
      throw new Error(`设置翻译密钥状态失败: ${error.response?.data?.error || error.message}`);
    }
  }

  async getAllKeys() {
    try {
      const response = await axios.get(`${this.baseUrl}/translation/keys`);
      return response.data;
    } catch (error) {
      throw new Error(`获取所有翻译密钥失败: ${error.response?.data?.error || error.message}`);
    }
  }
}

async function readRedisState(key) {
  const redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379');
  try {
    const cooldownKey = `cooldown:translation:${key}`;
    const protectionKey = `protection:translation:${key}`;

    const cooldownUntil = await redis.get(cooldownKey);
    const protectionExists = await redis.exists(protectionKey);
    const protectionTTL = await redis.ttl(protectionKey);

    return {
      inCooldown: !!cooldownUntil,
      cooldownUntil: cooldownUntil ? parseInt(cooldownUntil) : null,
      remainingCooldown: cooldownUntil ? Math.max(0, Math.ceil((parseInt(cooldownUntil) - Date.now()) / 1000)) : 0,
      inProtection: protectionExists === 1,
      protectionTTL: protectionTTL > 0 ? protectionTTL : 0
    };
  } finally {
    await redis.quit();
  }
}

async function readDBState(key) {
  const db = await mysql.createConnection({
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '3306'),
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'azure_speech_keymanager'
  });

  try {
    const [rows] = await db.execute('SELECT * FROM translation_keys WHERE `key` = ?', [key]);
    return rows.length > 0 ? rows[0] : null;
  } finally {
    await db.end();
  }
}

async function testProtectionPeriod() {
  console.log('=== 翻译密钥保护期机制测试 ===');

  const keyManager = new TranslationKeyManager();

  try {
    // 1. 获取一个enabled的key进行测试
    console.log('\n1. 获取可用翻译密钥...');
    const allKeysResult = await keyManager.getAllKeys();
    if (!allKeysResult.success) {
      console.log('❌ 获取翻译密钥列表失败');
      return;
    }

    const enabledKeys = allKeysResult.data.filter(key => key.status === 'enabled');
    if (enabledKeys.length === 0) {
      console.log('❌ 没有找到enabled状态的翻译密钥，无法进行测试');
      return;
    }

    const testKey = enabledKeys[0];
    console.log(`✅ 使用测试翻译密钥: ${testKey.keyname} (${testKey.key.substring(0, 8)}...)`);

    // 2. 触发冷却（短时间冷却便于测试）
    console.log('\n2. 触发5秒冷却...');
    const cooldownResult = await keyManager.setKeyStatus(testKey.key, 429, '测试保护期-短冷却');
    console.log(`   API响应: ${cooldownResult.message}`);
    console.log(`   动作: ${cooldownResult.data?.action}`);

    if (cooldownResult.data?.action !== 'cooldown') {
      console.log('⚠️  翻译密钥未进入冷却状态，跳过测试');
      return;
    }

    // 3. 等待冷却结束
    console.log('\n3. 等待22秒让冷却结束...');
    await new Promise(resolve => setTimeout(resolve, 22000));

    // 4. 检查保护期是否被设置
    console.log('\n4. 检查冷却结束后的保护期状态...');
    const afterCooldownState = await readRedisState(testKey.key);
    const afterCooldownDB = await readDBState(testKey.key);

    console.log('   Redis状态:');
    console.log(`     冷却中: ${afterCooldownState.inCooldown}`);
    console.log(`     保护期: ${afterCooldownState.inProtection} (TTL: ${afterCooldownState.protectionTTL}s)`);
    console.log('   数据库状态:');
    console.log(`     状态: ${afterCooldownDB.status}`);

    // 5. 立即尝试触发429，测试保护期
    console.log('\n5. 在保护期内尝试触发429...');
    const protectionTestResult = await keyManager.setKeyStatus(testKey.key, 429, '测试保护期功能');
    console.log(`   API响应: ${protectionTestResult.message}`);
    console.log(`   动作: ${protectionTestResult.data?.action}`);

    // 6. 验证保护期状态
    const protectionState = await readRedisState(testKey.key);
    const protectionDB = await readDBState(testKey.key);

    console.log('   保护期验证:');
    console.log(`     Redis保护期: ${protectionState.inProtection} (TTL: ${protectionState.protectionTTL}s)`);
    console.log(`     DB状态: ${protectionDB.status}`);

    if (protectionTestResult.data?.action === 'skip') {
      console.log('   ✅ 保护期正常工作，429错误被忽略');
    } else {
      console.log('   ❌ 保护期未生效，429错误未被忽略');
    }

    console.log('\n=== 测试完成 ===');

  } catch (error) {
    console.error('❌ 测试过程中出错:', error.message);
  }
}

testProtectionPeriod().catch(console.error);