import mysql from 'mysql2/promise';
import { TranslationKey, KeyStatus, LogAction, KeyLog } from '../types';
import logger from '../utils/logger';
import RedisCooldownManager from './RedisCooldownManager';
import RedisLockService from './RedisLockService';
import RedisConcurrencyManager from './RedisConcurrencyManager';

export class TranslationKeyManager {
  private db: mysql.Pool;
  private cooldownManager: RedisCooldownManager;
  private lockService: RedisLockService;
  private concurrencyManager: RedisConcurrencyManager;

  constructor(database: mysql.Pool) {
    this.db = database;
    this.lockService = new RedisLockService();
    this.cooldownManager = new RedisCooldownManager(this, 'translation');
    this.concurrencyManager = new RedisConcurrencyManager();
    this.cooldownManager.start();
    this.concurrencyManager.start();
  }

  /**
   * Get an available translation key for the specified region
   */
  async getKey(region: string = 'global', tag: string = '', maxConcurrentRequests: number = 10): Promise<TranslationKey | null> {
    const lockKey = `get_translation_key:${region}`;

    return await this.lockService.withLock(lockKey, async () => {
      const connection = await this.db.getConnection();

      try {
        await connection.beginTransaction();

        // Find available translation keys
        const [rows] = await connection.execute<mysql.RowDataPacket[]>(
          `SELECT * FROM translation_keys
           WHERE status = ? AND region = ?
           ORDER BY created_at ASC
           LIMIT 1 FOR UPDATE`,
          [KeyStatus.ENABLED, region]
        );

        if (rows.length === 0) {
          await connection.rollback();
          logger.warn(`No available translation keys found for region: ${region}`);
          return null;
        }

        const key = rows[0] as TranslationKey;

        // Check if key is in cooldown (double check)
        if (await this.cooldownManager.isKeyInCooldown(key.key)) {
          await connection.rollback();
          logger.warn(`Translation key ${this.maskKey(key.key)} is in cooldown, skipping`);
          return null;
        }

        // Check concurrent request limit
        if (await this.concurrencyManager.isAtConcurrencyLimit(key.key, maxConcurrentRequests)) {
          await connection.rollback();
          const currentConcurrency = await this.concurrencyManager.getCurrentConcurrency(key.key);
          logger.warn(`Translation key ${this.maskKey(key.key)} reached concurrent limit: ${currentConcurrency}/${maxConcurrentRequests}`);
          
          // Throw a specific error for 429 status
          const error = new Error('Too Many Requests - Concurrent limit reached');
          (error as any).statusCode = 429;
          (error as any).keyReachedLimit = true;
          throw error;
        }

        // Update usage statistics
        await connection.execute(
          `UPDATE translation_keys
           SET usage_count = usage_count + 1, last_used = NOW()
           WHERE id = ?`,
          [key.id]
        );

        // Log the action
        await this.logAction(connection, key.id!, LogAction.GET_KEY, 200, `Retrieved translation key for region: ${region}, tag: ${tag}`);

        await connection.commit();

        logger.info(`Translation key retrieved: ${this.maskKey(key.key)} for region: ${region}`);
        return key;

      } catch (error) {
        await connection.rollback();
        logger.error('Error getting translation key:', error);
        throw error;
      } finally {
        connection.release();
      }
    }, { ttl: 5000, retryCount: 3 });
  }

  /**
   * Set translation key status based on response code
   */
  async setKeyStatus(key: string, code: number, note: string = ''): Promise<{
    success: boolean;
    action: string;
    message: string;
    statusChanged: boolean;
  }> {
    const lockKey = `set_translation_status:${key}`;

    return await this.lockService.withLock(lockKey, async () => {
      const connection = await this.db.getConnection();

      try {
        await connection.beginTransaction();

        // Get key info
        const [rows] = await connection.execute<mysql.RowDataPacket[]>(
          'SELECT * FROM translation_keys WHERE `key` = ?',
          [key]
        );

        if (rows.length === 0) {
          throw new Error(`Translation key not found: ${this.maskKey(key)}`);
        }

        const keyInfo = rows[0] as TranslationKey;
        let newStatus = keyInfo.status;
        let logAction = LogAction.SET_STATUS;
        let shouldLog = false;
        let statusChanged = false;
        let action = 'none';
        let message = '';

        // Get configuration for status codes
        const disableCodes = await this.getConfigArray('disable_codes');
        const cooldownCodes = await this.getConfigArray('cooldown_codes');
        const cooldownSeconds = await this.getConfigValue('cooldown_seconds', 300);

        if (disableCodes.includes(code)) {
          // Disable key for certain error codes (401, 404, etc.) - only if not already disabled
          if (keyInfo.status !== KeyStatus.DISABLED) {
            newStatus = KeyStatus.DISABLED;
            logAction = LogAction.DISABLE_KEY;
            shouldLog = true;
            statusChanged = true;
            action = 'disable';
            message = `Translation key disabled due to error code: ${code}`;

            await connection.execute(
              'UPDATE translation_keys SET status = ?, error_count = error_count + 1 WHERE `key` = ?',
              [newStatus, key]
            );

            logger.warn(`Translation key ${this.maskKey(key)} disabled due to error code: ${code}`);
          } else {
            action = 'skip';
            message = `Translation key already disabled, skipping disable action for code: ${code}`;
            logger.info(`Translation key ${this.maskKey(key)} received code ${code} but is already disabled, skipping log`);
          }

        } else if (cooldownCodes.includes(code)) {
          // Handle 429 cooldown logic
          if (keyInfo.status === KeyStatus.COOLDOWN) {
            action = 'skip';
            message = `Translation key already in cooldown, skipping cooldown reset for code: ${code}`;
            logger.info(`Translation key ${this.maskKey(key)} received code ${code} but is already in cooldown, skipping`);

          } else if (keyInfo.status === KeyStatus.ENABLED) {
            // Check if key is in protection period
            const isInProtection = await this.cooldownManager.isKeyInProtectionPeriod(key);

            if (!isInProtection) {
              // Trigger cooldown
              newStatus = KeyStatus.COOLDOWN;
              logAction = LogAction.COOLDOWN_START;
              shouldLog = true;
              statusChanged = true;
              action = 'cooldown';
              message = `Translation key put in cooldown due to code: ${code} for ${cooldownSeconds} seconds`;

              await connection.execute(
                'UPDATE translation_keys SET status = ?, error_count = error_count + 1 WHERE `key` = ?',
                [newStatus, key]
              );

              // Add to cooldown manager
              await this.cooldownManager.addKeyToCooldownDirect(key, cooldownSeconds);

              logger.warn(`Translation key ${this.maskKey(key)} put in cooldown due to code: ${code} for ${cooldownSeconds} seconds`);
            } else {
              action = 'skip';
              message = `Translation key in protection period, skipping cooldown for code: ${code}`;
              logger.info(`Translation key ${this.maskKey(key)} received code ${code} but is in protection period, skipping`);
            }

          } else {
            action = 'skip';
            message = `Translation key not enabled (status: ${keyInfo.status}), skipping cooldown for code: ${code}`;
            logger.info(`Translation key ${this.maskKey(key)} received code ${code} but is not enabled (status: ${keyInfo.status}), skipping`);
          }

        } else {
          // For other codes, just log without changing status
          shouldLog = true;
          action = 'log';
          message = `Translation key status logged with code: ${code}`;
          logger.info(`Translation key ${this.maskKey(key)} status logged with code: ${code}`);
        }

        // Log the action only if needed
        if (shouldLog) {
          await this.logAction(connection, keyInfo.id!, logAction, code, note);
        }

        await connection.commit();

        return {
          success: true,
          action,
          message,
          statusChanged
        };

      } catch (error) {
        await connection.rollback();
        logger.error('Error setting translation key status:', error);
        throw error;
      } finally {
        connection.release();
      }
    }, { ttl: 3000, retryCount: 2 });
  }

  /**
   * Add a new translation key
   */
  async addKey(key: string, region: string, keyname: string = ''): Promise<TranslationKey> {
    const connection = await this.db.getConnection();

    try {
      await connection.beginTransaction();

      // Check if key already exists
      const [existing] = await connection.execute<mysql.RowDataPacket[]>(
        'SELECT id FROM translation_keys WHERE `key` = ?',
        [key]
      );

      if (existing.length > 0) {
        throw new Error(`Translation key already exists: ${this.maskKey(key)}`);
      }

      // Insert new key
      const [result] = await connection.execute<mysql.ResultSetHeader>(
        'INSERT INTO translation_keys (`key`, region, keyname, status) VALUES (?, ?, ?, ?)',
        [key, region, keyname || `TranslationKey-${Date.now()}`, KeyStatus.ENABLED]
      );

      const newKey: TranslationKey = {
        id: result.insertId,
        key,
        region,
        keyname: keyname || `TranslationKey-${Date.now()}`,
        status: KeyStatus.ENABLED
      };

      // Log the action
      await this.logAction(connection, newKey.id!, LogAction.ADD_KEY, 200, `Added translation key for region: ${region}`);

      await connection.commit();
      
      logger.info(`Translation key added: ${this.maskKey(key)} for region: ${region}`);
      return newKey;

    } catch (error) {
      await connection.rollback();
      logger.error('Error adding translation key:', error);
      throw error;
    } finally {
      connection.release();
    }
  }

  /**
   * Delete a translation key
   */
  async deleteKey(key: string): Promise<void> {
    const lockKey = `delete_translation:${key}`;

    return await this.lockService.withLock(lockKey, async () => {
      const connection = await this.db.getConnection();

      try {
        await connection.beginTransaction();

        // Get key info first
        const [rows] = await connection.execute<mysql.RowDataPacket[]>(
          'SELECT * FROM translation_keys WHERE `key` = ?',
          [key]
        );

        if (rows.length === 0) {
          throw new Error(`Translation key not found: ${this.maskKey(key)}`);
        }

        const keyInfo = rows[0] as TranslationKey;

        // Remove from cooldown if exists
        await this.cooldownManager.removeKeyFromCooldown(key);

        // Log the action before deletion
        await this.logAction(connection, keyInfo.id!, LogAction.DELETE_KEY, 200, 'Translation key deleted');

        // Delete the key
        await connection.execute('DELETE FROM translation_keys WHERE `key` = ?', [key]);

        await connection.commit();

        logger.info(`Translation key deleted: ${this.maskKey(key)}`);

      } catch (error) {
        await connection.rollback();
        logger.error('Error deleting translation key:', error);
        throw error;
      } finally {
        connection.release();
      }
    }, { ttl: 3000, retryCount: 2 });
  }

  /**
   * Disable a translation key
   */
  async disableKey(key: string): Promise<void> {
    const lockKey = `disable_translation:${key}`;

    return await this.lockService.withLock(lockKey, async () => {
      const connection = await this.db.getConnection();

      try {
        await connection.beginTransaction();

        // Get key info
        const [rows] = await connection.execute<mysql.RowDataPacket[]>(
          'SELECT * FROM translation_keys WHERE `key` = ?',
          [key]
        );

        if (rows.length === 0) {
          throw new Error(`Translation key not found: ${this.maskKey(key)}`);
        }

        const keyInfo = rows[0] as TranslationKey;

        // Remove from cooldown if exists
        await this.cooldownManager.removeKeyFromCooldown(key);

        // Update status
        await connection.execute(
          'UPDATE translation_keys SET status = ? WHERE `key` = ?',
          [KeyStatus.DISABLED, key]
        );

        // Log the action
        await this.logAction(connection, keyInfo.id!, LogAction.DISABLE_KEY, 200, 'Translation key manually disabled');

        await connection.commit();

        logger.info(`Translation key disabled: ${this.maskKey(key)}`);

      } catch (error) {
        await connection.rollback();
        logger.error('Error disabling translation key:', error);
        throw error;
      } finally {
        connection.release();
      }
    }, { ttl: 3000, retryCount: 2 });
  }

  /**
   * Enable a translation key
   */
  async enableKey(key: string): Promise<void> {
    return this.enableKeyInternal(key, true);
  }

  /**
   * Enable a translation key without removing cooldown (used by cooldown manager)
   */
  async enableKeyFromCooldown(key: string): Promise<void> {
    return this.enableKeyInternal(key, false);
  }

  /**
   * Internal method to enable a translation key with option to skip cooldown removal
   */
  private async enableKeyInternal(key: string, removeCooldown: boolean = true): Promise<void> {
    const lockKey = `enable_translation:${key}`;

    return await this.lockService.withLock(lockKey, async () => {
      const connection = await this.db.getConnection();

      try {
        await connection.beginTransaction();

        // Get key info
        const [rows] = await connection.execute<mysql.RowDataPacket[]>(
          'SELECT * FROM translation_keys WHERE `key` = ?',
          [key]
        );

        if (rows.length === 0) {
          throw new Error(`Translation key not found: ${this.maskKey(key)}`);
        }

        const keyInfo = rows[0] as TranslationKey;

        // Remove from cooldown if requested
        if (removeCooldown) {
          await this.cooldownManager.removeKeyFromCooldown(key);
        }

        // Update status
        await connection.execute(
          'UPDATE translation_keys SET status = ? WHERE `key` = ?',
          [KeyStatus.ENABLED, key]
        );

        // Log the action
        await this.logAction(connection, keyInfo.id!, LogAction.ENABLE_KEY, 200, 'Translation key enabled');

        await connection.commit();

        logger.info(`Translation key enabled: ${this.maskKey(key)}`);

      } catch (error) {
        await connection.rollback();
        logger.error('Error enabling translation key:', error);
        throw error;
      } finally {
        connection.release();
      }
    }, { ttl: 3000, retryCount: 2 });
  }

  /**
   * Update a translation key's information
   */
  async updateKey(key: string, keyname: string, region: string): Promise<TranslationKey> {
    const connection = await this.db.getConnection();

    try {
      await connection.beginTransaction();

      // Get key info
      const [rows] = await connection.execute<mysql.RowDataPacket[]>(
        'SELECT * FROM translation_keys WHERE `key` = ?',
        [key]
      );

      if (rows.length === 0) {
        throw new Error(`Translation key not found: ${this.maskKey(key)}`);
      }

      const keyInfo = rows[0] as TranslationKey;

      // Update key information
      await connection.execute(
        'UPDATE translation_keys SET keyname = ?, region = ? WHERE `key` = ?',
        [keyname, region, key]
      );

      // Log the action
      await this.logAction(connection, keyInfo.id!, LogAction.SET_STATUS, 200, `Translation key updated: keyname=${keyname}, region=${region}`);

      await connection.commit();

      const updatedKey: TranslationKey = {
        ...keyInfo,
        keyname,
        region
      };

      logger.info(`Translation key updated: ${this.maskKey(key)}`);
      return updatedKey;
    } catch (error) {
      await connection.rollback();
      logger.error('Error updating translation key:', error);
      throw error;
    } finally {
      connection.release();
    }
  }

  /**
   * Get all translation keys with their status
   */
  async getAllKeys(): Promise<TranslationKey[]> {
    try {
      // Sync cooldown states before returning keys
      await this.syncCooldownStates();
      
      const [rows] = await this.db.execute<mysql.RowDataPacket[]>(
        'SELECT * FROM translation_keys ORDER BY created_at DESC'
      );

      return rows as TranslationKey[];
    } catch (error) {
      logger.error('Error getting all translation keys:', error);
      throw error;
    }
  }

  /**
   * Get translation key logs with pagination
   */
  async getKeyLogs(page: number = 1, limit: number = 50): Promise<{ logs: KeyLog[], total: number }> {
    const offset = (page - 1) * limit;

    // Get total count
    const [countRows] = await this.db.execute<mysql.RowDataPacket[]>(
      'SELECT COUNT(*) as total FROM translation_key_logs'
    );
    const total = countRows[0].total;

    // Get logs with key info
    const [rows] = await this.db.execute<mysql.RowDataPacket[]>(
      `SELECT tkl.*, tk.keyname, tk.region
       FROM translation_key_logs tkl
       LEFT JOIN translation_keys tk ON tkl.key_id = tk.id
       ORDER BY tkl.created_at DESC
       LIMIT ${Number(limit)} OFFSET ${Number(offset)}`
    );

    return {
      logs: rows as KeyLog[],
      total
    };
  }

  /**
   * Log an action for translation keys
   */
  private async logAction(
    connection: mysql.PoolConnection,
    keyId: number,
    action: LogAction,
    statusCode?: number,
    note?: string
  ): Promise<void> {
    await connection.execute(
      'INSERT INTO translation_key_logs (key_id, action, status_code, note) VALUES (?, ?, ?, ?)',
      [keyId, action, statusCode, note]
    );
  }

  /**
   * Get configuration value
   */
  private async getConfigValue(key: string, defaultValue: any): Promise<any> {
    try {
      const [rows] = await this.db.execute<mysql.RowDataPacket[]>(
        'SELECT config_value FROM system_config WHERE config_key = ?',
        [key]
      );

      if (rows.length === 0) {
        return defaultValue;
      }

      const value = rows[0].config_value;
      
      // Try to parse as number if it's a number
      if (!isNaN(Number(value))) {
        return Number(value);
      }
      
      return value;
    } catch (error) {
      logger.error(`Error getting config value for ${key}:`, error);
      return defaultValue;
    }
  }

  /**
   * Get configuration array (comma-separated values)
   */
  private async getConfigArray(key: string): Promise<number[]> {
    try {
      const value = await this.getConfigValue(key, '');
      if (!value) return [];

      // Ensure value is a string
      const stringValue = typeof value === 'string' ? value : String(value);

      return stringValue.split(',').map((v: string) => parseInt(v.trim())).filter((v: number) => !isNaN(v));
    } catch (error) {
      logger.error(`Error getting config array for ${key}:`, error);
      return [];
    }
  }

  /**
   * Mask key for logging
   */
  private maskKey(key: string): string {
    if (key.length <= 8) {
      return key;
    }
    return key.substring(0, 8) + '...';
  }

  /**
   * Get cooldown manager instance
   */
  getCooldownManager(): RedisCooldownManager {
    return this.cooldownManager;
  }

  /**
   * Get concurrency manager instance
   */
  getConcurrencyManager(): RedisConcurrencyManager {
    return this.concurrencyManager;
  }

  /**
   * Sync database and Redis cooldown states for translation keys
   */
  async syncCooldownStates(): Promise<void> {
    logger.info('Starting translation cooldown state synchronization...');

    try {
      // Get all keys with cooldown status from database
      const [rows] = await this.db.execute<mysql.RowDataPacket[]>(
        'SELECT * FROM translation_keys WHERE status = ?',
        [KeyStatus.COOLDOWN]
      );

      const cooldownKeysInDB = rows as TranslationKey[];
      logger.info(`Found ${cooldownKeysInDB.length} translation keys in cooldown status in database`);

      // Check each key in Redis
      for (const keyInfo of cooldownKeysInDB) {
        const isInRedisCooldown = await this.cooldownManager.isKeyInCooldown(keyInfo.key);

        if (!isInRedisCooldown) {
          // Key is in cooldown in DB but not in Redis - enable it
          logger.info(`Translation key ${this.maskKey(keyInfo.key)} is in DB cooldown but not in Redis, enabling...`);
          await this.enableKeyFromCooldown(keyInfo.key);
        }
      }

      // Get all keys in Redis cooldown
      const redisStats = await this.cooldownManager.getStats();
      logger.info(`Found ${redisStats.totalCooldownKeys} translation keys in Redis cooldown`);

      logger.info('Translation cooldown state synchronization completed');
    } catch (error) {
      logger.error('Error during translation cooldown state synchronization:', error);
    }
  }

  /**
   * Cleanup resources
   */
  async cleanup(): Promise<void> {
    await this.cooldownManager.stop();
    await this.concurrencyManager.stop();
    logger.info('TranslationKeyManager cleanup completed');
  }
}

export default TranslationKeyManager;
