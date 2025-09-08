const Redis = require('ioredis');
require('dotenv').config();

async function checkRedisKeys() {
  console.log('=== 检查Redis中的冷却键 ===');
  
  const redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379');
  
  try {
    // 获取所有冷却相关的键
    console.log('\n1. 检查所有冷却键...');
    const cooldownKeys = await redis.keys('cooldown:*');
    console.log(`找到 ${cooldownKeys.length} 个冷却键:`);
    
    for (const key of cooldownKeys) {
      const value = await redis.get(key);
      const ttl = await redis.ttl(key);
      const expireTime = value ? new Date(parseInt(value)) : null;
      console.log(`  ${key}`);
      console.log(`    值: ${value} (${expireTime ? expireTime.toLocaleString() : 'N/A'})`);
      console.log(`    TTL: ${ttl}秒`);
    }
    
    // 获取所有保护期键
    console.log('\n2. 检查所有保护期键...');
    const protectionKeys = await redis.keys('protection:*');
    console.log(`找到 ${protectionKeys.length} 个保护期键:`);
    
    for (const key of protectionKeys) {
      const value = await redis.get(key);
      const ttl = await redis.ttl(key);
      console.log(`  ${key}`);
      console.log(`    值: ${value}`);
      console.log(`    TTL: ${ttl}秒`);
    }
    
    // 分析键的类型分布
    console.log('\n3. 键类型分析:');
    const speechCooldownKeys = cooldownKeys.filter(key => key.startsWith('cooldown:speech:'));
    const translationCooldownKeys = cooldownKeys.filter(key => key.startsWith('cooldown:translation:'));
    const otherCooldownKeys = cooldownKeys.filter(key => !key.startsWith('cooldown:speech:') && !key.startsWith('cooldown:translation:'));
    
    console.log(`  语音冷却键: ${speechCooldownKeys.length}`);
    speechCooldownKeys.forEach(key => console.log(`    ${key}`));
    
    console.log(`  翻译冷却键: ${translationCooldownKeys.length}`);
    translationCooldownKeys.forEach(key => console.log(`    ${key}`));
    
    console.log(`  其他冷却键: ${otherCooldownKeys.length}`);
    otherCooldownKeys.forEach(key => console.log(`    ${key}`));
    
    // 检查是否有异常的键格式
    console.log('\n4. 检查异常键格式:');
    const allKeys = await redis.keys('*');
    const suspiciousKeys = allKeys.filter(key => 
      key.includes('cooldown') && !key.startsWith('cooldown:speech:') && !key.startsWith('cooldown:translation:')
    );
    
    if (suspiciousKeys.length > 0) {
      console.log(`❌ 发现 ${suspiciousKeys.length} 个可疑的冷却键:`);
      suspiciousKeys.forEach(key => console.log(`    ${key}`));
    } else {
      console.log('✅ 没有发现异常的键格式');
    }
    
  } catch (error) {
    console.error('❌ 检查Redis键时出错:', error.message);
  } finally {
    await redis.quit();
  }
}

checkRedisKeys().catch(console.error);