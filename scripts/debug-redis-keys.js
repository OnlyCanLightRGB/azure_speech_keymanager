const axios = require('axios');
const Redis = require('ioredis');

const BASE_URL = 'http://localhost:3019/api';

class DebugManager {
  constructor() {
    this.redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379');
  }

  async makeRequest(url, data = {}) {
    try {
      const response = await axios.post(url, data);
      return response.data;
    } catch (error) {
      return { success: false, message: error.message };
    }
  }

  async getKeyStats(type) {
    let url;
    if (type === 'speech') {
      url = `${BASE_URL}/keys/stats`;
    } else {
      url = `${BASE_URL}/${type}/keys/stats`;
    }
    return await this.makeRequest(url);
  }

  async getKey(type, region = 'eastasia') {
    let url;
    if (type === 'speech') {
      // Speech keys use GET request
      try {
        const response = await axios.get(`${BASE_URL}/keys/get`, { params: { region } });
        return response.data;
      } catch (error) {
        return { success: false, message: error.message };
      }
    } else {
      url = `${BASE_URL}/${type}/keys/get`;
      return await this.makeRequest(url, { region });
    }
  }

  async setKeyStatus(type, key, code, note = '') {
    let url;
    if (type === 'speech') {
      url = `${BASE_URL}/keys/status`;
    } else {
      url = `${BASE_URL}/${type}/keys/status`;
    }
    return await this.makeRequest(url, { key, code, note });
  }

  async getAllRedisKeys() {
    try {
      const allKeys = await this.redis.keys('*');
      const keyDetails = {};
      
      for (const key of allKeys) {
        const type = await this.redis.type(key);
        let value;
        
        if (type === 'string') {
          value = await this.redis.get(key);
          const ttl = await this.redis.ttl(key);
          keyDetails[key] = { type, value, ttl };
        } else {
          keyDetails[key] = { type, value: 'non-string' };
        }
      }
      
      return keyDetails;
    } catch (error) {
      console.error('Error getting Redis keys:', error);
      return {};
    }
  }

  async cleanup() {
    await this.redis.quit();
  }
}

async function debugRedisKeys() {
  console.log('=== Redis 键调试测试 ===');
  
  const debugManager = new DebugManager();
  
  try {
    // 1. 检查初始状态
    console.log('\n1. 检查初始状态...');
    const initialSpeechStats = await debugManager.getKeyStats('speech');
    const initialTranslationStats = await debugManager.getKeyStats('translation');
    const initialRedisKeys = await debugManager.getAllRedisKeys();
    
    console.log('   语音密钥统计:', initialSpeechStats);
    console.log('   翻译密钥统计:', initialTranslationStats);
    console.log('   Redis键数量:', Object.keys(initialRedisKeys).length);
    
    if (Object.keys(initialRedisKeys).length > 0) {
      console.log('   Redis键详情:');
      for (const [key, details] of Object.entries(initialRedisKeys)) {
        console.log(`     ${key}: ${JSON.stringify(details)}`);
      }
    }
    
    // 2. 获取测试密钥
    console.log('\n2. 获取测试密钥...');
    const speechKeyResult = await debugManager.getKey('speech');
    const translationKeyResult = await debugManager.getKey('translation');
    
    if (!speechKeyResult.success || !translationKeyResult.success) {
      console.log('❌ 无法获取测试密钥');
      return;
    }
    
    const speechKey = speechKeyResult.data.key;
    const translationKey = translationKeyResult.data.key;
    
    console.log(`   语音密钥: ${speechKey.substring(0, 8)}...`);
    console.log(`   翻译密钥: ${translationKey.substring(0, 8)}...`);
    
    // 3. 触发翻译密钥冷却
    console.log('\n3. 触发翻译密钥冷却...');
    const translationCooldownResult = await debugManager.setKeyStatus('translation', translationKey, 429, '调试测试');
    console.log('   翻译密钥冷却结果:', translationCooldownResult);
    
    // 4. 立即检查统计和Redis状态
    console.log('\n4. 检查翻译冷却后的状态...');
    const afterTranslationSpeechStats = await debugManager.getKeyStats('speech');
    const afterTranslationTranslationStats = await debugManager.getKeyStats('translation');
    const afterTranslationRedisKeys = await debugManager.getAllRedisKeys();
    
    console.log('   语音密钥统计（翻译冷却后）:', afterTranslationSpeechStats);
    console.log('   翻译密钥统计（翻译冷却后）:', afterTranslationTranslationStats);
    console.log('   Redis键数量:', Object.keys(afterTranslationRedisKeys).length);
    
    console.log('   Redis键详情:');
    for (const [key, details] of Object.entries(afterTranslationRedisKeys)) {
      console.log(`     ${key}: ${JSON.stringify(details)}`);
    }
    
    // 5. 分析问题
    console.log('\n5. 问题分析...');
    const speechCooldownCount = afterTranslationSpeechStats.data?.cooldown?.totalCooldownKeys || 0;
    const translationCooldownCount = afterTranslationTranslationStats.data?.cooldown?.totalCooldownKeys || 0;
    
    console.log(`   语音密钥统计显示冷却数量: ${speechCooldownCount}`);
    console.log(`   翻译密钥统计显示冷却数量: ${translationCooldownCount}`);
    
    // 检查Redis中实际的键
    const speechCooldownKeys = Object.keys(afterTranslationRedisKeys).filter(key => key.startsWith('cooldown:speech:'));
    const translationCooldownKeys = Object.keys(afterTranslationRedisKeys).filter(key => key.startsWith('cooldown:translation:'));
    
    console.log(`   Redis中实际语音冷却键数量: ${speechCooldownKeys.length}`);
    console.log(`   Redis中实际翻译冷却键数量: ${translationCooldownKeys.length}`);
    
    if (speechCooldownCount > 0 && speechCooldownKeys.length === 0) {
      console.log('   ❌ 发现问题：语音密钥统计显示有冷却密钥，但Redis中没有对应的键');
    } else if (speechCooldownCount !== speechCooldownKeys.length) {
      console.log('   ❌ 发现问题：语音密钥统计数量与Redis实际键数量不匹配');
    } else {
      console.log('   ✅ 语音密钥统计与Redis状态一致');
    }
    
    if (translationCooldownCount !== translationCooldownKeys.length) {
      console.log('   ❌ 发现问题：翻译密钥统计数量与Redis实际键数量不匹配');
    } else {
      console.log('   ✅ 翻译密钥统计与Redis状态一致');
    }
    
    // 6. 触发语音密钥冷却进行对比
    console.log('\n6. 触发语音密钥冷却进行对比...');
    const speechCooldownResult = await debugManager.setKeyStatus('speech', speechKey, 429, '调试测试');
    console.log('   语音密钥冷却结果:', speechCooldownResult);
    
    // 7. 最终状态检查
    console.log('\n7. 最终状态检查...');
    const finalSpeechStats = await debugManager.getKeyStats('speech');
    const finalTranslationStats = await debugManager.getKeyStats('translation');
    const finalRedisKeys = await debugManager.getAllRedisKeys();
    
    console.log('   最终语音密钥统计:', finalSpeechStats);
    console.log('   最终翻译密钥统计:', finalTranslationStats);
    
    const finalSpeechCooldownKeys = Object.keys(finalRedisKeys).filter(key => key.startsWith('cooldown:speech:'));
    const finalTranslationCooldownKeys = Object.keys(finalRedisKeys).filter(key => key.startsWith('cooldown:translation:'));
    
    console.log(`   Redis中最终语音冷却键数量: ${finalSpeechCooldownKeys.length}`);
    console.log(`   Redis中最终翻译冷却键数量: ${finalTranslationCooldownKeys.length}`);
    
    console.log('\n   所有Redis键:');
    for (const [key, details] of Object.entries(finalRedisKeys)) {
      console.log(`     ${key}: ${JSON.stringify(details)}`);
    }
    
  } catch (error) {
    console.error('❌ 调试过程中出错:', error);
  } finally {
    await debugManager.cleanup();
  }
}

debugRedisKeys().catch(console.error);