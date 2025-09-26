const mysql = require('mysql2/promise');

async function checkScheduleHistory() {
  const connection = await mysql.createConnection({
    host: 'localhost',
    user: 'root',
    password: '',
    database: 'azure_speech_keymanager'
  });

  try {
    // 检查最近的调度记录
    const [schedules] = await connection.execute(`
      SELECT id, config_id, scheduled_time, execution_time, status, result_message, created_at
      FROM json_billing_schedules 
      WHERE config_id = 7 
      ORDER BY created_at DESC 
      LIMIT 5
    `);
    
    console.log('Recent schedule records for config 7:');
    console.log(JSON.stringify(schedules, null, 2));
    
    // 检查配置状态
    const [config] = await connection.execute(`
      SELECT id, config_name, status, error_message, auto_query_enabled, 
             last_query_time, next_query_time, query_interval_minutes
      FROM json_billing_configs 
      WHERE id = 7
    `);
    
    console.log('\nConfig 7 current status:');
    console.log(JSON.stringify(config, null, 2));
    
  } finally {
    await connection.end();
  }
}

checkScheduleHistory().catch(console.error);