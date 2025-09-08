const { config } = require('dotenv');
const Redis = require('ioredis');
const mysql = require('mysql2/promise');
const axios = require('axios');

// Load environment variables
config();

// API base URL
const API_BASE_URL = 'http://localhost:3019/api';

class TranslationKeyManager {
  constructor(baseUrl = API_BASE_URL) {
    this.baseUrl = baseUrl;
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

async function checkRedisState(key) {
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

async function checkAllKeys() {
  console.log('=== 检查所有翻译密钥的Redis状态 ===');

  const keyManager = new TranslationKeyManager();

  try {
    const allKeysResult = await keyManager.getAllKeys();
    if (!allKeysResult.success) {
      console.log('❌ 获取翻译密钥列表失败');
      return;
    }

    const keys = allKeysResult.data;
    console.log(`\n找到 ${keys.length} 个翻译密钥:\n`);

    for (const keyInfo of keys) {
      const redisState = await checkRedisState(keyInfo.key);
      
      console.log(`密钥: ${keyInfo.keyname} (${keyInfo.key.substring(0, 8)}...)`);
      console.log(`  数据库状态: ${keyInfo.status}`);
      console.log(`  Redis冷却: ${redisState.inCooldown} ${redisState.inCooldown ? `(剩余${redisState.remainingCooldown}秒)` : ''}`);
      console.log(`  Redis保护期: ${redisState.inProtection} ${redisState.inProtection ? `(TTL: ${redisState.protectionTTL}秒)` : ''}`);
      console.log('');
    }

  } catch (error) {
    console.error('❌ 检查过程中出错:', error.message);
  }
}

checkAllKeys().catch(console.error);