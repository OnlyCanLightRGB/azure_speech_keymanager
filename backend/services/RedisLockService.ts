import Redis from 'ioredis';
import { v4 as uuidv4 } from 'uuid';
import logger from '../utils/logger';
import RedisConnection from '../database/redis';

export interface LockOptions {
  ttl?: number; // Time to live in milliseconds
  retryDelay?: number; // Delay between retry attempts in milliseconds
  retryCount?: number; // Maximum number of retry attempts
}

export class RedisLockService {
  private redis: Redis;
  private defaultTTL: number = 30000; // 30 seconds
  private defaultRetryDelay: number = 100; // 100ms
  private defaultRetryCount: number = 10;

  constructor() {
    this.redis = RedisConnection.getInstance().getClient();
  }

  /**
   * Acquire a distributed lock
   */
  async acquireLock(
    lockKey: string, 
    options: LockOptions = {}
  ): Promise<string | null> {
    const {
      ttl = this.defaultTTL,
      retryDelay = this.defaultRetryDelay,
      retryCount = this.defaultRetryCount
    } = options;

    const lockValue = uuidv4();
    const fullLockKey = `lock:${lockKey}`;

    for (let attempt = 0; attempt <= retryCount; attempt++) {
      try {
        // Try to acquire lock using SET with NX and PX options
        const result = await this.redis.set(fullLockKey, lockValue, 'PX', ttl, 'NX');
        
        if (result === 'OK') {
          logger.debug(`Lock acquired: ${lockKey} with value: ${lockValue}`);
          return lockValue;
        }

        // If this is not the last attempt, wait before retrying
        if (attempt < retryCount) {
          await this.sleep(retryDelay);
        }
      } catch (error) {
        logger.error(`Error acquiring lock ${lockKey}:`, error);
        if (attempt === retryCount) {
          throw error;
        }
        await this.sleep(retryDelay);
      }
    }

    logger.warn(`Failed to acquire lock: ${lockKey} after ${retryCount} attempts`);
    return null;
  }

  /**
   * Release a distributed lock
   */
  async releaseLock(lockKey: string, lockValue: string): Promise<boolean> {
    const fullLockKey = `lock:${lockKey}`;
    
    // Lua script to ensure atomic release (only release if we own the lock)
    const luaScript = `
      if redis.call("GET", KEYS[1]) == ARGV[1] then
        return redis.call("DEL", KEYS[1])
      else
        return 0
      end
    `;

    try {
      const result = await this.redis.eval(luaScript, 1, fullLockKey, lockValue) as number;
      const released = result === 1;
      
      if (released) {
        logger.debug(`Lock released: ${lockKey} with value: ${lockValue}`);
      } else {
        logger.warn(`Failed to release lock: ${lockKey} (not owner or already expired)`);
      }
      
      return released;
    } catch (error) {
      logger.error(`Error releasing lock ${lockKey}:`, error);
      return false;
    }
  }

  /**
   * Extend lock TTL
   */
  async extendLock(lockKey: string, lockValue: string, ttl: number): Promise<boolean> {
    const fullLockKey = `lock:${lockKey}`;
    
    // Lua script to extend TTL only if we own the lock
    const luaScript = `
      if redis.call("GET", KEYS[1]) == ARGV[1] then
        return redis.call("PEXPIRE", KEYS[1], ARGV[2])
      else
        return 0
      end
    `;

    try {
      const result = await this.redis.eval(luaScript, 1, fullLockKey, lockValue, ttl) as number;
      return result === 1;
    } catch (error) {
      logger.error(`Error extending lock ${lockKey}:`, error);
      return false;
    }
  }

  /**
   * Check if a lock exists
   */
  async isLocked(lockKey: string): Promise<boolean> {
    const fullLockKey = `lock:${lockKey}`;
    
    try {
      const result = await this.redis.exists(fullLockKey);
      return result === 1;
    } catch (error) {
      logger.error(`Error checking lock ${lockKey}:`, error);
      return false;
    }
  }

  /**
   * Execute a function with a distributed lock
   */
  async withLock<T>(
    lockKey: string,
    fn: () => Promise<T>,
    options: LockOptions = {}
  ): Promise<T> {
    const lockValue = await this.acquireLock(lockKey, options);
    
    if (!lockValue) {
      throw new Error(`Failed to acquire lock: ${lockKey}`);
    }

    try {
      return await fn();
    } finally {
      await this.releaseLock(lockKey, lockValue);
    }
  }

  /**
   * Sleep utility function
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Get lock information
   */
  async getLockInfo(lockKey: string): Promise<{ exists: boolean; ttl: number; value?: string }> {
    const fullLockKey = `lock:${lockKey}`;
    
    try {
      const [exists, ttl, value] = await Promise.all([
        this.redis.exists(fullLockKey),
        this.redis.pttl(fullLockKey),
        this.redis.get(fullLockKey)
      ]);

      return {
        exists: exists === 1,
        ttl: ttl,
        value: value || undefined
      };
    } catch (error) {
      logger.error(`Error getting lock info ${lockKey}:`, error);
      return { exists: false, ttl: -1 };
    }
  }
}

export default RedisLockService;
