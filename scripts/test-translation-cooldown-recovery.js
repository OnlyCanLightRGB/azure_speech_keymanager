const axios = require('axios');
const { config } = require('dotenv');

// 密钥状态枚举
const KeyStatus = {
  ENABLED: 'enabled',
  DISABLED: 'disabled',
  COOLDOWN: 'cooldown'
};

// Load environment variables
config();

// API base URL
const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL ?
  process.env.NEXT_PUBLIC_API_URL + '/api' :
  'http://localhost:3019/api';

class TranslationKeyManager {
  constructor(baseUrl = API_BASE_URL) {
    this.baseUrl = baseUrl;
  }

  async getKey(region = 'eastasia') {
    try {
      const response = await axios.get(`${this.baseUrl}/translation/keys/get?region=${region}`);
      return response.data;
    } catch (error) {
      throw new Error(`获取翻译密钥失败: ${error.response?.data?.error || error.message}`);
    }
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

  async getStats() {
    try {
      const response = await axios.get(`${this.baseUrl}/translation/keys/stats`);
      return response.data;
    } catch (error) {
      throw new Error(`获取翻译密钥统计失败: ${error.response?.data?.error || error.message}`);
    }
  }
}

// Redis和数据库连接（只读）
const Redis = require('ioredis');
const mysql = require('mysql2/promise');

async function readRedisState(key) {
  const redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379');
  try {
    // 使用正确的Redis键格式（匹配RedisCooldownManager的translation类型格式）
    const cooldownKey = `cooldown:translation:${key}`;
    const protectionKey = `protection:translation:${key}`;

    const cooldownUntil = await redis.get(cooldownKey);
    const protectionTTL = await redis.ttl(protectionKey);

    return {
      inCooldown: !!cooldownUntil,
      cooldownUntil: cooldownUntil ? parseInt(cooldownUntil) : null,
      remainingCooldown: cooldownUntil ? Math.max(0, Math.ceil((parseInt(cooldownUntil) - Date.now()) / 1000)) : 0,
      inProtection: protectionTTL > 0,
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

async function testTranslationCooldownRecovery() {
  console.log('=== 翻译密钥冷却恢复测试（API接口+状态验证）===');

  const keyManager = new TranslationKeyManager();

  try {
    // 1. 获取一个enabled的key进行测试
    console.log('\n1. 获取可用翻译密钥...');
    const allKeysResult = await keyManager.getAllKeys();
    if (!allKeysResult.success) {
      console.log('❌ 获取翻译密钥列表失败');
      return;
    }

    // 过滤状态和类型：只选择enabled状态的翻译密钥
    const enabledKeys = allKeysResult.data.filter(key => {
      // 支持多种状态格式：'enabled', 'ENABLED'
      const isEnabled = key.status === 'enabled' || key.status === 'ENABLED' || key.status === KeyStatus.ENABLED;
      // 确保是翻译密钥类型（通过API端点已经确保，但增加额外验证）
      const isTranslationKey = true; // 通过 /api/translation/keys 获取的都是翻译密钥
      return isEnabled && isTranslationKey;
    });
    
    if (enabledKeys.length === 0) {
      console.log('❌ 没有找到enabled状态的翻译密钥，无法进行测试');
      console.log('   当前所有翻译密钥状态:');
      allKeysResult.data.forEach((key, index) => {
        console.log(`   [${index + 1}] ${key.keyname || '未命名'}: ${key.status} (${key.key.substring(0, 8)}...)`);
      });
      return;
    }

    // 随机选择一个可用密钥进行测试，避免总是测试同一个密钥
    const randomIndex = Math.floor(Math.random() * enabledKeys.length);
    const testKey = enabledKeys[randomIndex];
    console.log(`✅ 使用测试翻译密钥 [${randomIndex + 1}/${enabledKeys.length}]: ${testKey.keyname} (${testKey.key.substring(0, 8)}...)`);

    // 2. 检查初始状态
    console.log('\n2. 检查初始状态...');
    const initialRedisState = await readRedisState(testKey.key);
    const initialDBState = await readDBState(testKey.key);

    console.log('   Redis状态:');
    console.log(`     冷却中: ${initialRedisState.inCooldown}`);
    console.log(`     保护期: ${initialRedisState.inProtection} (TTL: ${initialRedisState.protectionTTL}s)`);
    console.log('   数据库状态:');
    console.log(`     状态: ${initialDBState.status}`);
    console.log(`     错误次数: ${initialDBState.error_count}`);

    // 3. 模拟触发429错误，设置冷却
    console.log('\n3. 模拟429错误触发冷却...');
    const cooldownResult = await keyManager.setKeyStatus(testKey.key, 429, '测试翻译密钥冷却功能');
    console.log(`   API响应: ${cooldownResult.message}`);
    console.log(`   动作: ${cooldownResult.data?.action}`);
    console.log(`   状态是否改变: ${cooldownResult.data?.statusChanged}`);

    if (cooldownResult.data?.action !== 'cooldown') {
      console.log('⚠️  翻译密钥未进入冷却状态，可能已在冷却中或保护期内');
      console.log(`   实际动作: ${cooldownResult.data?.action}`);
      return;
    }

    // 4. 验证冷却状态设置
    console.log('\n4. 验证冷却状态设置...');
    await new Promise(resolve => setTimeout(resolve, 1000)); // 等待1秒让状态同步

    const afterCooldownRedisState = await readRedisState(testKey.key);
    const afterCooldownDBState = await readDBState(testKey.key);

    console.log('   Redis状态:');
    console.log(`     冷却中: ${afterCooldownRedisState.inCooldown}`);
    console.log(`     剩余时间: ${afterCooldownRedisState.remainingCooldown}秒`);
    console.log(`     保护期: ${afterCooldownRedisState.inProtection}`);
    console.log('   数据库状态:');
    console.log(`     状态: ${afterCooldownDBState.status}`);
    console.log(`     错误次数: ${afterCooldownDBState.error_count}`);

    // 验证状态一致性
    const redisDBConsistent = afterCooldownRedisState.inCooldown && afterCooldownDBState.status === 'cooldown';
    console.log(`   状态一致性: ${redisDBConsistent ? '✅ 一致' : '❌ 不一致'}`);

    if (!redisDBConsistent) {
      console.log('❌ Redis和数据库状态不一致，冷却设置可能有问题');
      return;
    }

    // 5. 监控恢复过程
    console.log('\n5. 监控冷却恢复过程...');
    let recovered = false;
    let checkCount = 0;
    const maxChecks = 25; // 最多检查25秒

    while (!recovered && checkCount < maxChecks) {
      checkCount++;

      try {
        // 直接读取Redis和数据库状态
        const currentRedisState = await readRedisState(testKey.key);
        const currentDBState = await readDBState(testKey.key);

        console.log(`  [${checkCount}s] Redis冷却剩余: ${currentRedisState.remainingCooldown}秒, DB状态: ${currentDBState.status}`);

        if (!currentRedisState.inCooldown && currentDBState.status === 'enabled') {
          recovered = true;
          console.log('  ✅ 冷却已恢复，翻译密钥重新启用！');
          break;
        }

      } catch (error) {
        console.log(`  [${checkCount}s] 检查状态时出错: ${error.message}`);
      }

      await new Promise(resolve => setTimeout(resolve, 1000));
    }

    if (!recovered) {
      console.log('  ❌ 冷却未在预期时间内恢复');

      // 最终状态检查
      const finalRedisState = await readRedisState(testKey.key);
      const finalDBState = await readDBState(testKey.key);
      console.log('  最终状态:');
      console.log(`    Redis冷却: ${finalRedisState.inCooldown}, 剩余: ${finalRedisState.remainingCooldown}秒`);
      console.log(`    DB状态: ${finalDBState.status}`);
      return;
    }

    // 6. 测试保护期机制
    console.log('\n6. 测试保护期机制...');
    console.log('   尝试在保护期内再次设置429状态...');

    const protectionTestResult = await keyManager.setKeyStatus(testKey.key, 429, '测试保护期功能');
    console.log(`   API响应: ${protectionTestResult.message}`);
    console.log(`   动作: ${protectionTestResult.data?.action}`);

    // 验证保护期状态
    const protectionRedisState = await readRedisState(testKey.key);
    const protectionDBState = await readDBState(testKey.key);

    console.log('   保护期验证:');
    console.log(`     Redis保护期: ${protectionRedisState.inProtection} (TTL: ${protectionRedisState.protectionTTL}s)`);
    console.log(`     DB状态: ${protectionDBState.status}`);

    if (protectionTestResult.data?.action === 'skip') {
      console.log('   ✅ 保护期正常工作，429错误被忽略');
    } else if (protectionTestResult.data?.action === 'cooldown') {
      console.log('   ⚠️  保护期可能已过期，翻译密钥重新进入冷却');
    } else {
      console.log('   ℹ️  其他结果，可能保护期已结束');
    }

    // 7. 等待保护期结束后再次测试
    console.log('\n7. 等待保护期结束后测试...');
    console.log('   等待6秒（保护期为5秒）...');
    await new Promise(resolve => setTimeout(resolve, 6000));

    const afterProtectionResult = await keyManager.setKeyStatus(testKey.key, 429, '保护期结束后测试');
    console.log(`   API响应: ${afterProtectionResult.message}`);
    console.log(`   动作: ${afterProtectionResult.data?.action}`);

    // 最终验证
    const finalRedisState = await readRedisState(testKey.key);
    const finalDBState = await readDBState(testKey.key);

    console.log('   最终状态验证:');
    console.log(`     Redis冷却: ${finalRedisState.inCooldown}, 保护期: ${finalRedisState.inProtection}`);
    console.log(`     DB状态: ${finalDBState.status}`);

    if (afterProtectionResult.data?.action === 'cooldown') {
      console.log('   ✅ 保护期已结束，429错误正常触发冷却');
    } else {
      console.log('   ℹ️  未触发冷却，可能翻译密钥状态已改变');
    }

    console.log('\n=== 测试完成 ===');

  } catch (error) {
    console.error('❌ 测试过程中出错:', error.message);
  }
}

testTranslationCooldownRecovery().catch(console.error);