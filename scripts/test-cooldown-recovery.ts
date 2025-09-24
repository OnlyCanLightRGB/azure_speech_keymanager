import axios from 'axios';
import { config } from 'dotenv';
import Redis from 'ioredis';
import mysql from 'mysql2/promise';

// Load environment variables
config();

// API base URL
const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL ?
  process.env.NEXT_PUBLIC_API_URL + '/api' :
  'http://localhost:3019/api';

interface KeyResponse {
  success: boolean;
  data?: {
    key: string;
    region: string;
    endpoint: string;
  };
  error?: string;
}

interface StatusResponse {
  success: boolean;
  message?: string;
  error?: string;
}

interface KeysResponse {
  success: boolean;
  data?: Array<{
    key: string;
    region: string;
    endpoint: string;
    status: string;
    last_used: string;
  }>;
  error?: string;
}

interface StatsResponse {
  success: boolean;
  data?: {
    total: number;
    active: number;
    cooldown: number;
    error: number;
  };
  error?: string;
}

class AzureKeyManager {
  private baseUrl: string;

  constructor(baseUrl: string = API_BASE_URL) {
    this.baseUrl = baseUrl;
  }

  async getKey(region: string = 'eastasia'): Promise<KeyResponse> {
    try {
      const response = await axios.get(`${this.baseUrl}/keys/get?region=${region}`);
      return response.data;
    } catch (error: any) {
      throw new Error(`获取密钥失败: ${error.response?.data?.error || error.message}`);
    }
  }

  async setKeyStatus(key: string, code: string, note: string = ''): Promise<StatusResponse> {
    try {
      const response = await axios.post(`${this.baseUrl}/keys/status`, {
        key,
        code,
        note
      });
      return response.data;
    } catch (error: any) {
      throw new Error(`设置密钥状态失败: ${error.response?.data?.error || error.message}`);
    }
  }

  async getAllKeys(): Promise<KeysResponse> {
    try {
      const response = await axios.get(`${this.baseUrl}/keys`);
      return response.data;
    } catch (error: any) {
      throw new Error(`获取所有密钥失败: ${error.response?.data?.error || error.message}`);
    }
  }

  async getStats(): Promise<StatsResponse> {
    try {
      const response = await axios.get(`${this.baseUrl}/keys/stats`);
      return response.data;
    } catch (error: any) {
      throw new Error(`获取统计信息失败: ${error.response?.data?.error || error.message}`);
    }
  }
}

async function readRedisState(key: string): Promise<any> {
  const redis = new Redis({
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379'),
    password: process.env.REDIS_PASSWORD || undefined,
    db: parseInt(process.env.REDIS_DB || '0')
  });

  try {
    const state = await redis.hgetall(`azure_key:${key}`);
    await redis.quit();
    
    if (Object.keys(state).length === 0) {
      return null;
    }
    
    return {
      ...state,
      last_used: state.last_used ? new Date(parseInt(state.last_used)) : null,
      cooldown_until: state.cooldown_until ? new Date(parseInt(state.cooldown_until)) : null
    };
  } catch (error) {
    await redis.quit();
    throw error;
  }
}

async function readDBState(key: string): Promise<any> {
  const connection = await mysql.createConnection({
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'azure_speech_keys'
  });

  try {
    const [rows] = await connection.execute(
      'SELECT * FROM azure_keys WHERE key_value = ?',
      [key]
    );
    await connection.end();
    return (rows as any[])[0] || null;
  } catch (error) {
    await connection.end();
    throw error;
  }
}

async function testCooldownRecovery(): Promise<void> {
  console.log('🔄 开始测试冷却恢复机制...\n');

  const keyManager = new AzureKeyManager();

  try {
    // 1. 获取当前统计信息
    console.log('📊 获取当前密钥统计...');
    const stats = await keyManager.getStats();
    if (stats.success && stats.data) {
      console.log(`总密钥数: ${stats.data.total}`);
      console.log(`可用密钥: ${stats.data.active}`);
      console.log(`冷却密钥: ${stats.data.cooldown}`);
      console.log(`错误密钥: ${stats.data.error}\n`);
    }

    // 2. 获取所有密钥
    console.log('🔍 获取所有密钥信息...');
    const allKeys = await keyManager.getAllKeys();
    if (!allKeys.success || !allKeys.data) {
      throw new Error('无法获取密钥列表');
    }

    // 找到冷却状态的密钥
    const cooldownKeys = allKeys.data.filter(key => key.status === 'cooldown');
    console.log(`找到 ${cooldownKeys.length} 个冷却状态的密钥\n`);

    if (cooldownKeys.length === 0) {
      console.log('✅ 没有冷却状态的密钥，测试完成');
      return;
    }

    // 3. 检查每个冷却密钥的详细状态
    for (const keyInfo of cooldownKeys.slice(0, 3)) { // 只检查前3个
      console.log(`🔍 检查密钥: ${keyInfo.key.substring(0, 8)}...`);
      
      try {
        // 读取Redis状态
        const redisState = await readRedisState(keyInfo.key);
        console.log('Redis状态:', redisState ? {
          status: redisState.status,
          last_used: redisState.last_used,
          cooldown_until: redisState.cooldown_until,
          error_count: redisState.error_count
        } : '未找到');

        // 读取数据库状态
        const dbState = await readDBState(keyInfo.key);
        console.log('数据库状态:', dbState ? {
          status: dbState.status,
          last_used: dbState.last_used,
          cooldown_until: dbState.cooldown_until,
          error_count: dbState.error_count
        } : '未找到');

        // 检查是否应该恢复
        const now = new Date();
        let shouldRecover = false;
        let reason = '';

        if (redisState && redisState.cooldown_until) {
          const cooldownEnd = new Date(redisState.cooldown_until);
          if (now > cooldownEnd) {
            shouldRecover = true;
            reason = `冷却时间已过期 (${cooldownEnd.toISOString()})`;
          }
        }

        if (dbState && dbState.cooldown_until) {
          const cooldownEnd = new Date(dbState.cooldown_until);
          if (now > cooldownEnd) {
            shouldRecover = true;
            reason = `数据库显示冷却时间已过期 (${cooldownEnd.toISOString()})`;
          }
        }

        if (shouldRecover) {
          console.log(`🔄 密钥应该恢复: ${reason}`);
          
          // 尝试恢复密钥
          console.log('正在恢复密钥状态...');
          const result = await keyManager.setKeyStatus(keyInfo.key, 'active', '自动恢复测试');
          
          if (result.success) {
            console.log('✅ 密钥恢复成功');
          } else {
            console.log(`❌ 密钥恢复失败: ${result.error}`);
          }
        } else {
          console.log('⏳ 密钥仍在冷却期内');
        }

        console.log('---');
      } catch (error) {
        console.log(`❌ 检查密钥失败: ${(error as Error).message}`);
        console.log('---');
      }
    }

    // 4. 再次获取统计信息，查看变化
    console.log('\n📊 获取更新后的统计信息...');
    const finalStats = await keyManager.getStats();
    if (finalStats.success && finalStats.data) {
      console.log(`总密钥数: ${finalStats.data.total}`);
      console.log(`可用密钥: ${finalStats.data.active}`);
      console.log(`冷却密钥: ${finalStats.data.cooldown}`);
      console.log(`错误密钥: ${finalStats.data.error}`);

      // 计算变化
      if (stats.success && stats.data) {
        const activeChange = finalStats.data.active - stats.data.active;
        const cooldownChange = finalStats.data.cooldown - stats.data.cooldown;
        
        if (activeChange > 0) {
          console.log(`\n✅ 恢复了 ${activeChange} 个密钥`);
        }
        if (cooldownChange < 0) {
          console.log(`✅ 减少了 ${Math.abs(cooldownChange)} 个冷却密钥`);
        }
      }
    }

    console.log('\n✅ 冷却恢复测试完成');

  } catch (error) {
    console.error('❌ 测试失败:', (error as Error).message);
    process.exit(1);
  }
}

testCooldownRecovery().catch(console.error);