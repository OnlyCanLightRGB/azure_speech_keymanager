import Redis from 'ioredis';
import logger from '../utils/logger';
import RedisConnection from '../database/redis';

export interface ConcurrencyOptions {
  maxConcurrentRequests?: number; // 最大并发请求数
  requestTimeout?: number; // 请求超时时间（毫秒）
  cleanupInterval?: number; // 清理过期请求的间隔（毫秒）
}

export class RedisConcurrencyManager {
  private redis: Redis;
  private readonly CONCURRENT_PREFIX = 'concurrent:';
  private readonly REQUEST_PREFIX = 'request:';
  private readonly DEFAULT_MAX_CONCURRENT = 10; // 默认最大并发数
  private readonly DEFAULT_REQUEST_TIMEOUT = 30000; // 30秒超时
  private readonly DEFAULT_CLEANUP_INTERVAL = 10000; // 10秒清理间隔
  private cleanupInterval: NodeJS.Timeout | null = null;
  private running: boolean = false;

  constructor() {
    this.redis = RedisConnection.getInstance().getClient();
  }

  /**
   * 启动并发管理器
   */
  start(): void {
    if (this.running) {
      logger.warn('RedisConcurrencyManager is already running');
      return;
    }

    this.running = true;

    // 定期清理过期的请求记录
    this.cleanupInterval = setInterval(async () => {
      try {
        await this.cleanupExpiredRequests();
      } catch (error) {
        logger.error('Error in concurrency cleanup interval:', error);
      }
    }, this.DEFAULT_CLEANUP_INTERVAL);

    logger.info('RedisConcurrencyManager started with cleanup interval');
  }

  /**
   * 停止并发管理器
   */
  async stop(): Promise<void> {
    if (!this.running) {
      return;
    }

    logger.info('Stopping RedisConcurrencyManager...');
    this.running = false;

    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }

    // 清理所有并发计数器
    try {
      const pattern = this.CONCURRENT_PREFIX + '*';
      const keys = await this.redis.keys(pattern);
      if (keys.length > 0) {
        await this.redis.del(...keys);
        logger.info(`Cleared ${keys.length} concurrent counters during shutdown`);
      }
    } catch (error) {
      logger.error('Error during concurrency manager shutdown:', error);
    }

    logger.info('RedisConcurrencyManager stopped');
  }

  /**
   * 尝试获取请求许可（检查是否可以发起新请求）
   * @param key 密钥
   * @param options 并发选项
   * @returns 请求ID（成功）或null（达到并发限制）
   */
  async acquireRequest(
    key: string, 
    options: ConcurrencyOptions = {}
  ): Promise<string | null> {
    const {
      maxConcurrentRequests = this.DEFAULT_MAX_CONCURRENT,
      requestTimeout = this.DEFAULT_REQUEST_TIMEOUT
    } = options;

    const concurrentKey = this.CONCURRENT_PREFIX + key;
    const requestId = this.generateRequestId();
    const requestKey = this.REQUEST_PREFIX + key + ':' + requestId;
    const now = Date.now();
    const expireAt = now + requestTimeout;

    try {
      // 使用Lua脚本原子性地检查并发数并增加计数
      const luaScript = `
        local concurrentKey = KEYS[1]
        local requestKey = KEYS[2]
        local maxConcurrent = tonumber(ARGV[1])
        local expireAt = ARGV[2]
        local requestTimeout = tonumber(ARGV[3])
        
        -- 获取当前并发数
        local currentCount = redis.call('GET', concurrentKey)
        if not currentCount then
          currentCount = 0
        else
          currentCount = tonumber(currentCount)
        end
        
        -- 检查是否超过最大并发数
        if currentCount >= maxConcurrent then
          return nil
        end
        
        -- 增加并发计数
        redis.call('INCR', concurrentKey)
        redis.call('EXPIRE', concurrentKey, math.ceil(requestTimeout / 1000))
        
        -- 记录请求信息
        redis.call('SET', requestKey, expireAt, 'PX', requestTimeout)
        
        return 1
      `;

      const result = await this.redis.eval(
        luaScript, 
        2, 
        concurrentKey, 
        requestKey, 
        maxConcurrentRequests.toString(), 
        expireAt.toString(), 
        requestTimeout.toString()
      ) as number | null;

      if (result === 1) {
        logger.debug(`Request acquired for key ${this.maskKey(key)}: ${requestId}`);
        return requestId;
      } else {
        logger.warn(`Request rejected for key ${this.maskKey(key)}: concurrent limit ${maxConcurrentRequests} reached`);
        return null;
      }
    } catch (error) {
      logger.error(`Error acquiring request for key ${this.maskKey(key)}:`, error);
      return null;
    }
  }

  /**
   * 释放请求许可
   * @param key 密钥
   * @param requestId 请求ID
   */
  async releaseRequest(key: string, requestId: string): Promise<boolean> {
    const concurrentKey = this.CONCURRENT_PREFIX + key;
    const requestKey = this.REQUEST_PREFIX + key + ':' + requestId;

    try {
      // 使用Lua脚本原子性地删除请求记录并减少计数
      const luaScript = `
        local concurrentKey = KEYS[1]
        local requestKey = KEYS[2]
        
        -- 检查请求是否存在
        local exists = redis.call('EXISTS', requestKey)
        if exists == 0 then
          return 0
        end
        
        -- 删除请求记录
        redis.call('DEL', requestKey)
        
        -- 减少并发计数
        local currentCount = redis.call('GET', concurrentKey)
        if currentCount and tonumber(currentCount) > 0 then
          redis.call('DECR', concurrentKey)
        end
        
        return 1
      `;

      const result = await this.redis.eval(
        luaScript, 
        2, 
        concurrentKey, 
        requestKey
      ) as number;

      const released = result === 1;
      if (released) {
        logger.debug(`Request released for key ${this.maskKey(key)}: ${requestId}`);
      } else {
        logger.warn(`Request not found for release: key ${this.maskKey(key)}, requestId ${requestId}`);
      }

      return released;
    } catch (error) {
      logger.error(`Error releasing request for key ${this.maskKey(key)}:`, error);
      return false;
    }
  }

  /**
   * 获取密钥的当前并发数
   * @param key 密钥
   */
  async getCurrentConcurrency(key: string): Promise<number> {
    const concurrentKey = this.CONCURRENT_PREFIX + key;
    
    try {
      const count = await this.redis.get(concurrentKey);
      return count ? parseInt(count) : 0;
    } catch (error) {
      logger.error(`Error getting current concurrency for key ${this.maskKey(key)}:`, error);
      return 0;
    }
  }

  /**
   * 获取所有密钥的并发统计
   */
  async getConcurrencyStats(): Promise<{ [key: string]: number }> {
    try {
      const pattern = this.CONCURRENT_PREFIX + '*';
      const keys = await this.redis.keys(pattern);
      const stats: { [key: string]: number } = {};

      for (const concurrentKey of keys) {
        const key = concurrentKey.replace(this.CONCURRENT_PREFIX, '');
        const count = await this.redis.get(concurrentKey);
        stats[this.maskKey(key)] = count ? parseInt(count) : 0;
      }

      return stats;
    } catch (error) {
      logger.error('Error getting concurrency stats:', error);
      return {};
    }
  }

  /**
   * 清理过期的请求记录
   */
  private async cleanupExpiredRequests(): Promise<void> {
    if (!this.running) {
      return;
    }

    try {
      const pattern = this.REQUEST_PREFIX + '*';
      const requestKeys = await this.redis.keys(pattern);
      const now = Date.now();
      let cleanedCount = 0;

      for (const requestKey of requestKeys) {
        try {
          const expireAt = await this.redis.get(requestKey);
          if (expireAt && now > parseInt(expireAt)) {
            // 请求已过期，清理记录并减少并发计数
            const keyParts = requestKey.replace(this.REQUEST_PREFIX, '').split(':');
            if (keyParts.length >= 2) {
              const key = keyParts.slice(0, -1).join(':'); // 重新组合密钥（去掉最后的requestId）
              const concurrentKey = this.CONCURRENT_PREFIX + key;
              
              // 删除过期请求记录
              await this.redis.del(requestKey);
              
              // 减少并发计数
              const currentCount = await this.redis.get(concurrentKey);
              if (currentCount && parseInt(currentCount) > 0) {
                await this.redis.decr(concurrentKey);
              }
              
              cleanedCount++;
            }
          }
        } catch (error) {
          logger.error(`Error cleaning up request ${requestKey}:`, error);
        }
      }

      if (cleanedCount > 0) {
        logger.info(`Cleaned up ${cleanedCount} expired requests`);
      }
    } catch (error) {
      logger.error('Error in cleanup expired requests:', error);
    }
  }

  /**
   * 生成唯一的请求ID
   */
  private generateRequestId(): string {
    return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * 掩码密钥用于日志记录
   */
  private maskKey(key: string): string {
    if (key.length <= 8) {
      return key;
    }
    return key.substring(0, 8) + '...';
  }

  /**
   * 检查密钥是否达到并发限制
   * @param key 密钥
   * @param maxConcurrentRequests 最大并发数
   */
  async isAtConcurrencyLimit(key: string, maxConcurrentRequests: number = this.DEFAULT_MAX_CONCURRENT): Promise<boolean> {
    const currentConcurrency = await this.getCurrentConcurrency(key);
    return currentConcurrency >= maxConcurrentRequests;
  }
}

export default RedisConcurrencyManager;