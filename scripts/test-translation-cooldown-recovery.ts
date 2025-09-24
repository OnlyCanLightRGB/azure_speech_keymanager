import axios from 'axios';
import { config } from 'dotenv';
import Redis from 'ioredis';
import mysql from 'mysql2/promise';

// 密钥状态枚举
const KeyStatus = {
  ENABLED: 'enabled',
  DISABLED: 'disabled',
  COOLDOWN: 'cooldown'
} as const;

type KeyStatusType = typeof KeyStatus[keyof typeof KeyStatus];

// Load environment variables
config();

// API base URL
const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL ?
  process.env.NEXT_PUBLIC_API_URL + '/api' :
  'http://localhost:3019/api';

interface TranslationKeyResponse {
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

interface TranslationKeysResponse {
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
    enabled: number;
    cooldown: number;
    disabled: number;
  };
  error?: string;
}

class TranslationKeyManager {
  private baseUrl: string;

  constructor(baseUrl: string = API_BASE_URL) {
    this.baseUrl = baseUrl;
  }

  async getKey(region: string = 'eastasia'): Promise<TranslationKeyResponse> {
    try {
      const response = await axios.get(`${this.baseUrl}/translation/keys/get?region=${region}`);
      return response.data;
    } catch (error: any) {
      throw new Error(`获取翻译密钥失败: ${error.response?.data?.error || error.message}`);
    }
  }

  async setKeyStatus(key: string, code: string, note: string = ''): Promise<StatusResponse> {
    try {
      const response = await axios.post(`${this.baseUrl}/translation/keys/status`, {
        key,
        code,
        note
      });
      return response.data;
    } catch (error: any) {
      throw new Error(`设置翻译密钥状态失败: ${error.response?.data?.error || error.message}`);
    }
  }

  async getAllKeys(): Promise<TranslationKeysResponse> {
    try {
      const response = await axios.get(`${this.baseUrl}/translation/keys`);
      return response.data;
    } catch (error: any) {
      throw new Error(`获取所有翻译密钥失败: ${error.response?.data?.error || error.message}`);
    }
  }

  async getStats(): Promise<StatsResponse> {
    try {
      const response = await axios.get(`${this.baseUrl}/translation/keys/stats`);
      return response.data;
    } catch (error: any) {
      throw new Error(`获取翻译密钥统计信息失败: ${error.response?.data?.error || error.message}`);
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
    const state = await redis.hgetall(`translation_key:${key}`);
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
      'SELECT * FROM translation_keys WHERE key_value = ?',
      [key]
    );
    await connection.end();
    return (rows as any[])[0] || null;
  } catch (error) {
    await connection.end();
    throw error;
  }
}

async function testTranslationCooldownRecovery(): Promise<void> {
  console.log('🔄 开始测试翻译密钥冷却恢复机制...\n');

  const keyManager = new TranslationKeyManager();

  try {
    // 1. 获取当前统计信息
    console.log('📊 获取当前翻译密钥统计...');
    const stats = await keyManager.getStats();
    if (stats.success && stats.data) {
      console.log(`总密钥数: ${stats.data.total}`);
      console.log(`可用密钥: ${stats.data.enabled}`);
      console.log(`冷却密钥: ${stats.data.cooldown}`);
      console.log(`禁用密钥: ${stats.data.disabled}\n`);
    }

    // 2. 获取所有密钥
    console.log('🔍 获取所有翻译密钥信息...');
    const allKeys = await keyManager.getAllKeys();
    if (!allKeys.success || !allKeys.data) {
      throw new Error('无法获取翻译密钥列表');
    }

    // 找到冷却状态的密钥
    const cooldownKeys = allKeys.data.filter(key => key.status === KeyStatus.COOLDOWN);
    console.log(`找到 ${cooldownKeys.length} 个冷却状态的翻译密钥\n`);

    if (cooldownKeys.length === 0) {
      console.log('✅ 没有冷却状态的翻译密钥，测试完成');
      return;
    }

    // 3. 检查每个冷却密钥的详细状态
    for (const keyInfo of cooldownKeys.slice(0, 3)) { // 只检查前3个
      console.log(`🔍 检查翻译密钥: ${keyInfo.key.substring(0, 8)}...`);
      
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
          console.log(`🔄 翻译密钥应该恢复: ${reason}`);
          
          // 尝试恢复密钥
          console.log('正在恢复翻译密钥状态...');
          const result = await keyManager.setKeyStatus(keyInfo.key, KeyStatus.ENABLED, '自动恢复测试');
          
          if (result.success) {
            console.log('✅ 翻译密钥恢复成功');
          } else {
            console.log(`❌ 翻译密钥恢复失败: ${result.error}`);
          }
        } else {
          console.log('⏳ 翻译密钥仍在冷却期内');
        }

        console.log('---');
      } catch (error) {
        console.log(`❌ 检查翻译密钥失败: ${(error as Error).message}`);
        console.log('---');
      }
    }

    // 4. 再次获取统计信息，查看变化
    console.log('\n📊 获取更新后的翻译密钥统计信息...');
    const finalStats = await keyManager.getStats();
    if (finalStats.success && finalStats.data) {
      console.log(`总密钥数: ${finalStats.data.total}`);
      console.log(`可用密钥: ${finalStats.data.enabled}`);
      console.log(`冷却密钥: ${finalStats.data.cooldown}`);
      console.log(`禁用密钥: ${finalStats.data.disabled}`);

      // 计算变化
      if (stats.success && stats.data) {
        const enabledChange = finalStats.data.enabled - stats.data.enabled;
        const cooldownChange = finalStats.data.cooldown - stats.data.cooldown;
        
        if (enabledChange > 0) {
          console.log(`\n✅ 恢复了 ${enabledChange} 个翻译密钥`);
        }
        if (cooldownChange < 0) {
          console.log(`✅ 减少了 ${Math.abs(cooldownChange)} 个冷却翻译密钥`);
        }
      }
    }

    console.log('\n✅ 翻译密钥冷却恢复测试完成');

  } catch (error) {
    console.error('❌ 翻译密钥测试失败:', (error as Error).message);
    process.exit(1);
  }
}

testTranslationCooldownRecovery().catch(console.error);