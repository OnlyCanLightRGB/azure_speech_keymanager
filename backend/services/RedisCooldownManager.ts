import Redis from 'ioredis';
import { CooldownKey } from '../types';
import logger from '../utils/logger';
import RedisConnection from '../database/redis';

export class RedisCooldownManager {
  private redis: Redis;
  private monitorInterval: NodeJS.Timeout | null = null;
  private running: boolean = false;
  private keyManager: any; // Will be injected
  private readonly COOLDOWN_PREFIX = 'cooldown:';
  private readonly PROTECTION_PREFIX = 'protection:';
  private readonly PROTECTION_PERIOD = 5000; // 5 seconds in milliseconds
  private readonly keyType: string; // 'speech' or 'translation'

  constructor(keyManager: any, keyType: string = 'speech') {
    this.keyManager = keyManager;
    this.keyType = keyType;
    this.redis = RedisConnection.getInstance().getClient();
  }

  /**
   * Start the cooldown manager
   */
  start(): void {
    if (this.running) {
      logger.warn('RedisCooldownManager is already running');
      return;
    }

    this.running = true;

    // Use setInterval with proper error handling
    this.monitorInterval = setInterval(async () => {
      try {
        await this.monitorCooldowns();
      } catch (error) {
        logger.error('Error in cooldown monitor interval:', error);
      }
    }, 5000); // Check every 5 seconds (reduced frequency since immediate check is done in isKeyInCooldown)

    logger.info('RedisCooldownManager started with monitoring interval');

    // Test the monitor immediately
    setTimeout(async () => {
      logger.info('Testing cooldown monitor immediately...');
      try {
        await this.monitorCooldowns();
        logger.info('Initial cooldown monitor test completed');
      } catch (error) {
        logger.error('Error in initial cooldown monitor test:', error);
      }
    }, 2000);
  }

  /**
   * Stop the cooldown manager
   */
  async stop(): Promise<void> {
    if (!this.running) {
      return;
    }

    logger.info('Stopping RedisCooldownManager...');
    this.running = false;

    if (this.monitorInterval) {
      clearInterval(this.monitorInterval);
      this.monitorInterval = null;
    }

    // Force enable all cooldown keys
    try {
      const cooldownKeys = await this.getAllCooldownKeys();
      for (const key of cooldownKeys) {
        try {
          await this.removeKeyFromCooldown(key);
          await this.keyManager.enableKey(key);
          logger.info(`Force enabled key during shutdown: ${this.maskKey(key)}`);
        } catch (error) {
          logger.error(`Failed to enable key ${this.maskKey(key)} during shutdown:`, error);
        }
      }
    } catch (error) {
      logger.error('Error during cooldown manager shutdown:', error);
    }

    logger.info('RedisCooldownManager stopped');
  }

  /**
   * Add a key to cooldown (with protection period check)
   */
  async addKeyToCooldown(key: string, cooldownSeconds: number = 300): Promise<void> {
    // Check if key is in protection period
    if (await this.isKeyInProtectionPeriod(key)) {
      logger.info(`Key ${this.maskKey(key)} is in protection period, skipping cooldown`);
      return;
    }

    await this.addKeyToCooldownDirect(key, cooldownSeconds);
  }

  /**
   * Add a key to cooldown directly (without protection period check)
   * Used when protection period has already been checked in KeyManager
   */
  async addKeyToCooldownDirect(key: string, cooldownSeconds: number = 300): Promise<void> {
    const cooldownKey = this.COOLDOWN_PREFIX + this.keyType + ':' + key;
    const cooldownUntil = Date.now() + (cooldownSeconds * 1000);

    try {
      await this.redis.set(cooldownKey, cooldownUntil.toString(), 'PX', cooldownSeconds * 1000);
      logger.info(`${this.keyType} key ${this.maskKey(key)} added to cooldown for ${cooldownSeconds} seconds`);
    } catch (error) {
      logger.error(`Error adding ${this.keyType} key ${this.maskKey(key)} to cooldown:`, error);
      throw error;
    }
  }

  /**
   * Remove a key from cooldown manually
   */
  async removeKeyFromCooldown(key: string): Promise<boolean> {
    const cooldownKey = this.COOLDOWN_PREFIX + this.keyType + ':' + key;
    
    try {
      const result = await this.redis.del(cooldownKey);
      const removed = result === 1;
      
      if (removed) {
        // Set protection period when cooldown ends
        await this.setProtectionPeriod(key);
        logger.info(`${this.keyType} key ${this.maskKey(key)} manually removed from cooldown`);
      }
      
      return removed;
    } catch (error) {
      logger.error(`Error removing ${this.keyType} key ${this.maskKey(key)} from cooldown:`, error);
      return false;
    }
  }

  /**
   * Check if a key is in cooldown
   */
  async isKeyInCooldown(key: string): Promise<boolean> {
    const cooldownKey = this.COOLDOWN_PREFIX + this.keyType + ':' + key;

    try {
      const cooldownUntil = await this.redis.get(cooldownKey);
      if (!cooldownUntil) {
        return false;
      }

      const now = Date.now();
      const cooldownTime = parseInt(cooldownUntil);

      if (now >= cooldownTime) {
        // Cooldown expired, immediately enable key and set protection period
        await this.redis.del(cooldownKey);
        await this.setProtectionPeriod(key);

        // Immediately enable the key instead of waiting for monitor
        try {
          await this.keyManager.enableKeyFromCooldown(key);
          logger.info(`${this.keyType} key ${this.maskKey(key)} cooldown expired, immediately enabled`);
        } catch (error) {
          logger.error(`Failed to immediately enable ${this.keyType} key ${this.maskKey(key)} after cooldown:`, error);
        }

        return false;
      }

      return true;
    } catch (error) {
      logger.error(`Error checking cooldown for ${this.keyType} key ${this.maskKey(key)}:`, error);
      return false;
    }
  }

  /**
   * Check if a key is in protection period (5 seconds after cooldown ends)
   */
  async isKeyInProtectionPeriod(key: string): Promise<boolean> {
    const protectionKey = this.PROTECTION_PREFIX + this.keyType + ':' + key;
    
    try {
      const exists = await this.redis.exists(protectionKey);
      return exists === 1;
    } catch (error) {
      logger.error(`Error checking protection period for ${this.keyType} key ${this.maskKey(key)}:`, error);
      return false;
    }
  }

  /**
   * Set protection period for a key
   */
  private async setProtectionPeriod(key: string): Promise<void> {
    const protectionKey = this.PROTECTION_PREFIX + this.keyType + ':' + key;
    
    try {
      await this.redis.set(protectionKey, '1', 'PX', this.PROTECTION_PERIOD);
      logger.debug(`Protection period set for ${this.keyType} key ${this.maskKey(key)}`);
    } catch (error) {
      logger.error(`Error setting protection period for ${this.keyType} key ${this.maskKey(key)}:`, error);
    }
  }

  /**
   * Get remaining cooldown time for a key in seconds
   */
  async getRemainingCooldownTime(key: string): Promise<number> {
    const cooldownKey = this.COOLDOWN_PREFIX + this.keyType + ':' + key;
    
    try {
      const cooldownUntil = await this.redis.get(cooldownKey);
      if (!cooldownUntil) {
        return 0;
      }

      const remaining = Math.max(0, Math.ceil((parseInt(cooldownUntil) - Date.now()) / 1000));
      return remaining;
    } catch (error) {
      logger.error(`Error getting remaining cooldown time for key ${this.maskKey(key)}:`, error);
      return 0;
    }
  }

  /**
   * Get all keys currently in cooldown
   */
  async getCooldownKeys(): Promise<CooldownKey[]> {
    try {
      const pattern = this.COOLDOWN_PREFIX + this.keyType + ':*';
      const keys = await this.redis.keys(pattern);
      const result: CooldownKey[] = [];
      const now = Date.now();
      const prefixToRemove = this.COOLDOWN_PREFIX + this.keyType + ':';

      for (const cooldownKey of keys) {
        const key = cooldownKey.replace(prefixToRemove, '');
        const cooldownUntil = await this.redis.get(cooldownKey);
        
        if (cooldownUntil && parseInt(cooldownUntil) > now) {
          result.push({
            key: this.maskKey(key),
            cooldownUntil: parseInt(cooldownUntil)
          });
        }
      }

      return result;
    } catch (error) {
      logger.error(`Error getting ${this.keyType} cooldown keys:`, error);
      return [];
    }
  }

  /**
   * Get all cooldown keys (internal use)
   */
  private async getAllCooldownKeys(): Promise<string[]> {
    try {
      const pattern = this.COOLDOWN_PREFIX + this.keyType + ':*';
      const keys = await this.redis.keys(pattern);
      const prefixToRemove = this.COOLDOWN_PREFIX + this.keyType + ':';
      return keys.map((key: string) => key.replace(prefixToRemove, ''));
    } catch (error) {
      logger.error(`Error getting all ${this.keyType} cooldown keys:`, error);
      return [];
    }
  }

  /**
   * Get cooldown statistics
   */
  async getStats(): Promise<{ totalCooldownKeys: number; activeKeys: string[] }> {
    try {
      const cooldownKeys = await this.getCooldownKeys();
      return {
        totalCooldownKeys: cooldownKeys.length,
        activeKeys: cooldownKeys.map(ck => ck.key)
      };
    } catch (error) {
      logger.error('Error getting cooldown stats:', error);
      return { totalCooldownKeys: 0, activeKeys: [] };
    }
  }

  /**
   * Monitor cooldowns and enable expired keys (backup mechanism)
   * Primary recovery is handled in isKeyInCooldown for immediate response
   */
  private async monitorCooldowns(): Promise<void> {
    if (!this.running) {
      return;
    }

    try {
      const pattern = this.COOLDOWN_PREFIX + this.keyType + ':*';
      const redisKeys = await this.redis.keys(pattern);
      const now = Date.now();
      const keysToEnable: string[] = [];

      // Check Redis keys for expired cooldowns
      if (redisKeys.length > 0) {
        logger.info(`Cooldown monitor: checking ${redisKeys.length} Redis keys`);

        // Find expired keys in Redis
        for (const cooldownKey of redisKeys) {
          // Extract the actual key by removing the full prefix (cooldown:keyType:)
          const keyWithType = cooldownKey.replace(this.COOLDOWN_PREFIX, '');
          if (!keyWithType.startsWith(this.keyType + ':')) {
            // Skip keys that don't belong to this manager's keyType
            continue;
          }
          const key = keyWithType.replace(this.keyType + ':', '');
          const cooldownUntil = await this.redis.get(cooldownKey);

          if (cooldownUntil && now >= parseInt(cooldownUntil)) {
            keysToEnable.push(key);
            logger.info(`Monitor found expired Redis key: ${this.maskKey(key)} (type: ${this.keyType}) (${now} >= ${parseInt(cooldownUntil)})`);
          } else if (cooldownUntil) {
            const remaining = Math.ceil((parseInt(cooldownUntil) - now) / 1000);
            logger.debug(`Key ${this.maskKey(key)} (type: ${this.keyType}) has ${remaining}s remaining`);
          }
        }
      }

      // Check database for cooldown keys without Redis records (orphaned keys)
      try {
        const orphanedKeys = await this.findOrphanedCooldownKeys();
        if (orphanedKeys.length > 0) {
          logger.info(`Cooldown monitor: found ${orphanedKeys.length} orphaned cooldown keys in database`);
          keysToEnable.push(...orphanedKeys);
        }
      } catch (error) {
        logger.error('Error checking for orphaned cooldown keys:', error);
      }

      // Enable all expired/orphaned keys
      if (keysToEnable.length > 0) {
        logger.info(`Cooldown monitor: enabling ${keysToEnable.length} keys`);

        for (const key of keysToEnable) {
          try {
            // Remove from cooldown and set protection period
            const cooldownKey = this.COOLDOWN_PREFIX + this.keyType + ':' + key;
            await this.redis.del(cooldownKey);
            await this.setProtectionPeriod(key);

            // Enable the key in database
            await this.keyManager.enableKeyFromCooldown(key);
            logger.info(`Monitor enabled key: ${this.maskKey(key)}`);
          } catch (error) {
            logger.error(`Monitor failed to enable key ${this.maskKey(key)}:`, error);
          }
        }
      } else {
        // Only log occasionally when no keys need recovery
        if (Math.random() < 0.1) { // 10% chance to log
          logger.debug('Cooldown monitor: no keys need recovery');
        }
      }
    } catch (error) {
      logger.error('Error in cooldown monitor:', error);
    }
  }

  /**
   * Find keys that are in cooldown status in database but have no Redis record
   */
  private async findOrphanedCooldownKeys(): Promise<string[]> {
    try {
      // This requires access to the database through keyManager
      // We'll implement this by checking database directly
      const db = (this.keyManager as any).db; // Access private db property

      // Only check the table corresponding to this manager's keyType
      let rows;
      if (this.keyType === 'speech') {
        const [azureRows] = await db.execute(
          'SELECT `key` FROM azure_keys WHERE status = ?',
          ['cooldown']
        );
        rows = azureRows;
      } else if (this.keyType === 'translation') {
        const [translationRows] = await db.execute(
          'SELECT `key` FROM translation_keys WHERE status = ?',
          ['cooldown']
        );
        rows = translationRows;
      } else {
        logger.warn(`Unknown keyType: ${this.keyType}, skipping orphaned key check`);
        return [];
      }

      const orphanedKeys: string[] = [];

      for (const row of rows) {
        const key = row.key;
        const cooldownKey = this.COOLDOWN_PREFIX + this.keyType + ':' + key;

        // Check if this key exists in Redis
        const exists = await this.redis.exists(cooldownKey);
        if (exists === 0) {
          // Key is in cooldown in DB but not in Redis - it's orphaned
          orphanedKeys.push(key);
          logger.info(`Found orphaned cooldown key: ${this.maskKey(key)} (type: ${this.keyType})`);
        }
      }

      return orphanedKeys;
    } catch (error) {
      logger.error('Error finding orphaned cooldown keys:', error);
      return [];
    }
  }

  /**
   * Mask key for logging (show only first 8 characters)
   */
  private maskKey(key: string): string {
    if (key.length <= 8) {
      return key;
    }
    return key.substring(0, 8) + '...';
  }
}

export default RedisCooldownManager;
