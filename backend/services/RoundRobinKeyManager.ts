import mysql from 'mysql2/promise';
import { AzureKey, KeyStatus } from '../types';
import logger from '../utils/logger';
import RedisCooldownManager from './RedisCooldownManager';
import RedisLockService from './RedisLockService';

/**
 * 轮询调度密钥管理器
 * 实现真正的轮询调度策略，每次请求轮流使用不同的密钥
 */
export class RoundRobinKeyManager {
  private db: mysql.Pool;
  private cooldownManager: RedisCooldownManager;
  private lockService: RedisLockService;
  private redis: any;
  private readonly ROUND_ROBIN_PREFIX = 'round_robin:';

  constructor(database: mysql.Pool, cooldownManager: RedisCooldownManager, lockService: RedisLockService) {
    this.db = database;
    this.cooldownManager = cooldownManager;
    this.lockService = lockService;
    // 使用与cooldownManager相同的redis实例
    this.redis = cooldownManager['redis'];
  }

  /**
   * 使用轮询调度策略获取密钥
   */
  async getKeyWithRoundRobin(region: string = 'eastasia', tag: string = ''): Promise<AzureKey | null> {
    const lockKey = `round_robin_getkey:${region}`;

    return await this.lockService.withLock(lockKey, async () => {
      const connection = await this.db.getConnection();

      try {
        await connection.beginTransaction();

        // 获取所有可用的密钥
        const [rows] = await connection.execute<mysql.RowDataPacket[]>(
          `SELECT * FROM azure_keys
           WHERE status = ? AND region = ?
           ORDER BY id ASC
           FOR UPDATE`,
          [KeyStatus.ENABLED, region]
        );

        if (rows.length === 0) {
          await connection.rollback();
          logger.warn(`No available keys found for region: ${region}`);
          return null;
        }

        const keys = rows as AzureKey[];
        
        // 过滤掉冷却中的密钥
        const availableKeys: AzureKey[] = [];
        for (const key of keys) {
          const isInCooldown = await this.cooldownManager.isKeyInCooldown(key.key);
          if (!isInCooldown) {
            availableKeys.push(key);
          }
        }

        if (availableKeys.length === 0) {
          await connection.rollback();
          logger.warn(`All available keys for region ${region} are in cooldown`);
          return null;
        }

        // 获取当前轮询索引
        const roundRobinKey = `${this.ROUND_ROBIN_PREFIX}${region}`;
        let currentIndex = 0;
        
        try {
          const indexStr = await this.redis.get(roundRobinKey);
          if (indexStr) {
            currentIndex = parseInt(indexStr, 10) || 0;
          }
        } catch (error) {
          logger.debug(`Error getting round robin index for region ${region}:`, error);
        }

        // 确保索引在有效范围内
        currentIndex = currentIndex % availableKeys.length;
        
        // 选择当前索引对应的密钥
        const selectedKey = availableKeys[currentIndex];
        
        // 更新轮询索引到下一个位置
        const nextIndex = (currentIndex + 1) % availableKeys.length;
        try {
          await this.redis.set(roundRobinKey, nextIndex.toString(), 'EX', 3600); // 1小时过期
        } catch (error) {
          logger.debug(`Error setting round robin index for region ${region}:`, error);
        }

        // 更新使用统计
        await connection.execute(
          `UPDATE azure_keys
           SET usage_count = usage_count + 1, last_used = NOW()
           WHERE id = ?`,
          [selectedKey.id]
        );

        await connection.commit();

        logger.info(`Round-robin key selected: ${this.maskKey(selectedKey.key)} for region: ${region} (index: ${currentIndex}/${availableKeys.length}, usage_count: ${(selectedKey.usage_count || 0) + 1})`);
        return selectedKey;

      } catch (error) {
        await connection.rollback();
        logger.error('Error getting key with round-robin:', error);
        throw error;
      } finally {
        connection.release();
      }
    }, { ttl: 5000, retryCount: 3 });
  }

  /**
   * 重置指定区域的轮询索引
   */
  async resetRoundRobinIndex(region: string): Promise<void> {
    const roundRobinKey = `${this.ROUND_ROBIN_PREFIX}${region}`;
    try {
      await this.redis.del(roundRobinKey);
      logger.info(`Round-robin index reset for region: ${region}`);
    } catch (error) {
      logger.error(`Error resetting round-robin index for region ${region}:`, error);
    }
  }

  /**
   * 获取指定区域的当前轮询索引
   */
  async getCurrentRoundRobinIndex(region: string): Promise<number> {
    const roundRobinKey = `${this.ROUND_ROBIN_PREFIX}${region}`;
    try {
      const indexStr = await this.redis.get(roundRobinKey);
      return indexStr ? parseInt(indexStr, 10) || 0 : 0;
    } catch (error) {
      logger.debug(`Error getting round-robin index for region ${region}:`, error);
      return 0;
    }
  }

  /**
   * 获取所有区域的轮询状态
   */
  async getAllRoundRobinStatus(): Promise<{ [region: string]: { currentIndex: number, availableKeys: number } }> {
    const status: { [region: string]: { currentIndex: number, availableKeys: number } } = {};
    
    try {
      // 获取所有区域
      const [rows] = await this.db.execute<mysql.RowDataPacket[]>(
        'SELECT DISTINCT region FROM azure_keys WHERE status = ?',
        [KeyStatus.ENABLED]
      );

      for (const row of rows) {
        const region = row.region;
        const currentIndex = await this.getCurrentRoundRobinIndex(region);
        
        // 计算可用密钥数量
        const [keyRows] = await this.db.execute<mysql.RowDataPacket[]>(
          'SELECT * FROM azure_keys WHERE status = ? AND region = ?',
          [KeyStatus.ENABLED, region]
        );
        
        let availableCount = 0;
        for (const keyRow of keyRows) {
          const isInCooldown = await this.cooldownManager.isKeyInCooldown(keyRow.key);
          if (!isInCooldown) {
            availableCount++;
          }
        }
        
        status[region] = {
          currentIndex,
          availableKeys: availableCount
        };
      }
    } catch (error) {
      logger.error('Error getting round-robin status:', error);
    }

    return status;
  }

  /**
   * 清理过期的轮询索引
   */
  async cleanupExpiredIndexes(): Promise<void> {
    try {
      const pattern = `${this.ROUND_ROBIN_PREFIX}*`;
      const keys = await this.redis.keys(pattern);
      
      for (const key of keys) {
        const ttl = await this.redis.ttl(key);
        if (ttl === -1) { // 没有过期时间的key
          await this.redis.expire(key, 3600); // 设置1小时过期
        }
      }
      
      logger.debug(`Cleaned up ${keys.length} round-robin indexes`);
    } catch (error) {
      logger.error('Error cleaning up expired round-robin indexes:', error);
    }
  }

  /**
   * 掩码密钥显示
   */
  private maskKey(key: string): string {
    if (key.length <= 8) return key;
    return key.substring(0, 4) + '****' + key.substring(key.length - 4);
  }
}

export default RoundRobinKeyManager;