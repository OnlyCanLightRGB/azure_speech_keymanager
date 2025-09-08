const mysql = require('mysql2/promise');
require('dotenv').config();

async function checkKeyOverlap() {
  console.log('=== 检查语音密钥和翻译密钥是否存在重复 ===');
  
  const dbConfig = {
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'azure_speech_keymanager',
    port: parseInt(process.env.DB_PORT || '3306')
  };

  let connection;
  try {
    connection = await mysql.createConnection(dbConfig);
    console.log('✅ 数据库连接成功');

    // 获取语音密钥
    console.log('\n1. 获取语音密钥列表...');
    const [speechRows] = await connection.execute(
      'SELECT keyname, `key`, status FROM azure_keys ORDER BY keyname'
    );
    console.log(`   找到 ${speechRows.length} 个语音密钥`);

    // 获取翻译密钥
    console.log('\n2. 获取翻译密钥列表...');
    const [translationRows] = await connection.execute(
      'SELECT keyname, `key`, status FROM translation_keys ORDER BY keyname'
    );
    console.log(`   找到 ${translationRows.length} 个翻译密钥`);

    // 检查密钥重复
    console.log('\n3. 检查密钥重复...');
    const speechKeys = new Set(speechRows.map(row => row.key));
    const translationKeys = new Set(translationRows.map(row => row.key));
    
    const overlappingKeys = [];
    for (const key of translationKeys) {
      if (speechKeys.has(key)) {
        overlappingKeys.push(key);
      }
    }

    if (overlappingKeys.length > 0) {
      console.log(`❌ 发现 ${overlappingKeys.length} 个重复密钥:`);
      for (const key of overlappingKeys) {
        const speechKey = speechRows.find(row => row.key === key);
        const translationKey = translationRows.find(row => row.key === key);
        console.log(`   密钥: ${key.substring(0, 20)}...`);
        console.log(`     语音密钥: ${speechKey.keyname} (状态: ${speechKey.status})`);
        console.log(`     翻译密钥: ${translationKey.keyname} (状态: ${translationKey.status})`);
        console.log('');
      }
      console.log('\n⚠️  这就是问题所在！相同的密钥值在两个表中存在，');
      console.log('   当翻译密钥冷却时，Redis键 cooldown:translation:${key}');
      console.log('   但如果语音密钥使用相同的key值，可能会产生混淆。');
    } else {
      console.log('✅ 没有发现重复密钥');
    }

    // 显示密钥前缀对比
    console.log('\n4. 密钥前缀对比:');
    console.log('   语音密钥前缀:');
    speechRows.slice(0, 5).forEach(row => {
      console.log(`     ${row.keyname}: ${row.key.substring(0, 20)}... (${row.status})`);
    });
    
    console.log('   翻译密钥前缀:');
    translationRows.slice(0, 5).forEach(row => {
      console.log(`     ${row.keyname}: ${row.key.substring(0, 20)}... (${row.status})`);
    });

  } catch (error) {
    console.error('❌ 检查过程中出错:', error.message);
  } finally {
    if (connection) {
      await connection.end();
    }
  }
}

checkKeyOverlap().catch(console.error);