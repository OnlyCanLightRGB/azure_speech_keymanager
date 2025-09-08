import mysql from 'mysql2/promise';
import { AzureKey, KeyStatus, LogAction, KeyLog } from '../types';
import logger from '../utils/logger';
import RedisCooldownManager from './RedisCooldownManager';
import RedisLockService from './RedisLockService';

export class KeyManager {
  private db: mysql.Pool;
  private cooldownManager: RedisCooldownManager;
  private lockService: RedisLockService;

  constructor(database: mysql.Pool) {
    this.db = database;
    this.lockService = new RedisLockService();
    this.cooldownManager = new RedisCooldownManager(this, 'speech');
    this.cooldownManager.start();
  }

  /**
   * Get an available key for the specified region
   */
  async getKey(region: string = 'eastasia', tag: string = ''): Promise<AzureKey | null> {
    const lockKey = `getkey:${region}`;

    return await this.lockService.withLock(lockKey, async () => {
      const connection = await this.db.getConnection();

      try {
        await connection.beginTransaction();

        // Find available keys
        const [rows] = await connection.execute<mysql.RowDataPacket[]>(
          `SELECT * FROM azure_keys
           WHERE status = ? AND region = ?
           ORDER BY created_at ASC
           LIMIT 1 FOR UPDATE`,
          [KeyStatus.ENABLED, region]
        );

        if (rows.length === 0) {
          await connection.rollback();
          logger.warn(`No available keys found for region: ${region}`);
          return null;
        }

        const key = rows[0] as AzureKey;

        // Check if key is in cooldown (double check)
        if (await this.cooldownManager.isKeyInCooldown(key.key)) {
          await connection.rollback();
          logger.warn(`Key ${this.maskKey(key.key)} is in cooldown, skipping`);
          return null;
        }



        // Update usage statistics
        await connection.execute(
          `UPDATE azure_keys
           SET usage_count = usage_count + 1, last_used = NOW()
           WHERE id = ?`,
          [key.id]
        );

        // Log the action
        await this.logAction(connection, key.id!, LogAction.GET_KEY, 200, `Retrieved for region: ${region}, tag: ${tag}`);

        await connection.commit();

        logger.info(`Key retrieved: ${this.maskKey(key.key)} for region: ${region}`);
        return key;

      } catch (error) {
        await connection.rollback();
        logger.error('Error getting key:', error);
        throw error;
      } finally {
        connection.release();
      }
    }, { ttl: 5000, retryCount: 3 }); // 5 second lock timeout, 3 retries
  }

  /**
   * Set key status based on response code
   */
  async setKeyStatus(key: string, code: number, note: string = ''): Promise<{
    success: boolean;
    action: string;
    message: string;
    statusChanged: boolean;
  }> {
    const lockKey = `setstatus:${key}`;

    return await this.lockService.withLock(lockKey, async () => {
      const connection = await this.db.getConnection();

      try {
        await connection.beginTransaction();

        // Get key info
        const [rows] = await connection.execute<mysql.RowDataPacket[]>(
          'SELECT * FROM azure_keys WHERE `key` = ?',
          [key]
        );

        if (rows.length === 0) {
          throw new Error(`Key not found: ${this.maskKey(key)}`);
        }

        const keyInfo = rows[0] as AzureKey;
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
            message = `Key disabled due to error code: ${code}`;

            await connection.execute(
              'UPDATE azure_keys SET status = ?, error_count = error_count + 1 WHERE `key` = ?',
              [newStatus, key]
            );

            logger.warn(`Key ${this.maskKey(key)} disabled due to error code: ${code}`);
          } else {
            // Key is already disabled, skip logging
            action = 'skip';
            message = `Key already disabled, skipping disable action for code: ${code}`;
            logger.info(`Key ${this.maskKey(key)} received code ${code} but is already disabled, skipping log`);
          }

        } else if (cooldownCodes.includes(code)) {
          // Handle 429 cooldown logic
          // 1. If key is already in cooldown, skip (don't reset timer)
          // 2. If key is in protection period, skip
          // 3. Only trigger cooldown if key is enabled and not in protection

          if (keyInfo.status === KeyStatus.COOLDOWN) {
            // Key is already in cooldown, skip without changing timer
            action = 'skip';
            message = `Key already in cooldown, skipping cooldown reset for code: ${code}`;
            logger.info(`Key ${this.maskKey(key)} received code ${code} but is already in cooldown, skipping`);

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
              message = `Key put in cooldown due to code: ${code} for ${cooldownSeconds} seconds`;

              await connection.execute(
                'UPDATE azure_keys SET status = ?, error_count = error_count + 1 WHERE `key` = ?',
                [newStatus, key]
              );

              // Add to cooldown manager (without double-checking protection period)
              await this.cooldownManager.addKeyToCooldownDirect(key, cooldownSeconds);

              logger.warn(`Key ${this.maskKey(key)} put in cooldown due to code: ${code} for ${cooldownSeconds} seconds`);
            } else {
              // Key is in protection period
              action = 'skip';
              message = `Key in protection period, skipping cooldown for code: ${code}`;
              logger.info(`Key ${this.maskKey(key)} received code ${code} but is in protection period, skipping`);
            }

          } else {
            // Key is disabled or other status, skip
            action = 'skip';
            message = `Key not enabled (status: ${keyInfo.status}), skipping cooldown for code: ${code}`;
            logger.info(`Key ${this.maskKey(key)} received code ${code} but is not enabled (status: ${keyInfo.status}), skipping`);
          }

        } else {
          // For other codes, just log without changing status
          shouldLog = true;
          action = 'log';
          message = `Status logged with code: ${code}`;
          logger.info(`Key ${this.maskKey(key)} status logged with code: ${code}`);
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
        logger.error('Error setting key status:', error);
        throw error;
      } finally {
        connection.release();
      }
    }, { ttl: 3000, retryCount: 2 }); // 3 second lock timeout, 2 retries
  }

  /**
   * Add a new key
   */
  async addKey(key: string, region: string, keyname: string = ''): Promise<AzureKey> {
    const connection = await this.db.getConnection();

    try {
      await connection.beginTransaction();

      // Check if key already exists
      const [existing] = await connection.execute<mysql.RowDataPacket[]>(
        'SELECT id FROM azure_keys WHERE `key` = ?',
        [key]
      );

      if (existing.length > 0) {
        throw new Error(`Key already exists: ${this.maskKey(key)}`);
      }

      // Insert new key
      const [result] = await connection.execute<mysql.ResultSetHeader>(
        'INSERT INTO azure_keys (`key`, region, keyname, status) VALUES (?, ?, ?, ?)',
        [key, region, keyname || `Key-${Date.now()}`, KeyStatus.ENABLED]
      );

      const newKey: AzureKey = {
        id: result.insertId,
        key,
        region,
        keyname: keyname || `Key-${Date.now()}`,
        status: KeyStatus.ENABLED
      };

      // Log the action
      await this.logAction(connection, newKey.id!, LogAction.ADD_KEY, 200, `Added key for region: ${region}`);

      await connection.commit();
      
      logger.info(`Key added: ${this.maskKey(key)} for region: ${region}`);
      return newKey;

    } catch (error) {
      await connection.rollback();
      logger.error('Error adding key:', error);
      throw error;
    } finally {
      connection.release();
    }
  }

  /**
   * Delete a key
   */
  async deleteKey(key: string): Promise<void> {
    const lockKey = `delete:${key}`;

    return await this.lockService.withLock(lockKey, async () => {
      const connection = await this.db.getConnection();

      try {
        await connection.beginTransaction();

        // Get key info first
        const [rows] = await connection.execute<mysql.RowDataPacket[]>(
          'SELECT * FROM azure_keys WHERE `key` = ?',
          [key]
        );

        if (rows.length === 0) {
          throw new Error(`Key not found: ${this.maskKey(key)}`);
        }

        const keyInfo = rows[0] as AzureKey;

        // Remove from cooldown if exists
        await this.cooldownManager.removeKeyFromCooldown(key);

        // Log the action before deletion
        await this.logAction(connection, keyInfo.id!, LogAction.DELETE_KEY, 200, 'Key deleted');

        // Delete the key
        await connection.execute('DELETE FROM azure_keys WHERE `key` = ?', [key]);

        await connection.commit();

        logger.info(`Key deleted: ${this.maskKey(key)}`);

      } catch (error) {
        await connection.rollback();
        logger.error('Error deleting key:', error);
        throw error;
      } finally {
        connection.release();
      }
    }, { ttl: 3000, retryCount: 2 });
  }

  /**
   * Disable a key
   */
  async disableKey(key: string): Promise<void> {
    const lockKey = `disable:${key}`;

    return await this.lockService.withLock(lockKey, async () => {
      const connection = await this.db.getConnection();

      try {
        await connection.beginTransaction();

        // Get key info
        const [rows] = await connection.execute<mysql.RowDataPacket[]>(
          'SELECT * FROM azure_keys WHERE `key` = ?',
          [key]
        );

        if (rows.length === 0) {
          throw new Error(`Key not found: ${this.maskKey(key)}`);
        }

        const keyInfo = rows[0] as AzureKey;

        // Remove from cooldown if exists
        await this.cooldownManager.removeKeyFromCooldown(key);

        // Update status
        await connection.execute(
          'UPDATE azure_keys SET status = ? WHERE `key` = ?',
          [KeyStatus.DISABLED, key]
        );

        // Log the action
        await this.logAction(connection, keyInfo.id!, LogAction.DISABLE_KEY, 200, 'Manually disabled');

        await connection.commit();

        logger.info(`Key disabled: ${this.maskKey(key)}`);

      } catch (error) {
        await connection.rollback();
        logger.error('Error disabling key:', error);
        throw error;
      } finally {
        connection.release();
      }
    }, { ttl: 3000, retryCount: 2 });
  }

  /**
   * Enable a key (used by cooldown manager and manual enable)
   */
  async enableKey(key: string): Promise<void> {
    return this.enableKeyInternal(key, true);
  }

  /**
   * Enable a key without removing cooldown (used by cooldown manager)
   */
  async enableKeyFromCooldown(key: string): Promise<void> {
    return this.enableKeyInternal(key, false);
  }

  /**
   * Internal method to enable a key with option to skip cooldown removal
   */
  private async enableKeyInternal(key: string, removeCooldown: boolean = true): Promise<void> {
    const lockKey = `enable:${key}`;

    return await this.lockService.withLock(lockKey, async () => {
      const connection = await this.db.getConnection();

      try {
        await connection.beginTransaction();

        // Get key info
        const [rows] = await connection.execute<mysql.RowDataPacket[]>(
          'SELECT * FROM azure_keys WHERE `key` = ?',
          [key]
        );

        if (rows.length === 0) {
          throw new Error(`Key not found: ${this.maskKey(key)}`);
        }

        const keyInfo = rows[0] as AzureKey;

        // Remove from cooldown if requested (avoid circular calls)
        if (removeCooldown) {
          await this.cooldownManager.removeKeyFromCooldown(key);
        }

        // Update status
        await connection.execute(
          'UPDATE azure_keys SET status = ? WHERE `key` = ?',
          [KeyStatus.ENABLED, key]
        );

        // Log the action
        await this.logAction(connection, keyInfo.id!, LogAction.ENABLE_KEY, 200, 'Key enabled');

        await connection.commit();

        logger.info(`Key enabled: ${this.maskKey(key)}`);

      } catch (error) {
        await connection.rollback();
        logger.error('Error enabling key:', error);
        throw error;
      } finally {
        connection.release();
      }
    }, { ttl: 3000, retryCount: 2 });
  }

  /**
   * Update a key's information
   */
  async updateKey(key: string, keyname: string, region: string): Promise<AzureKey> {
    const connection = await this.db.getConnection();

    try {
      await connection.beginTransaction();

      // Get key info
      const [rows] = await connection.execute<mysql.RowDataPacket[]>(
        'SELECT * FROM azure_keys WHERE `key` = ?',
        [key]
      );

      if (rows.length === 0) {
        throw new Error(`Key not found: ${this.maskKey(key)}`);
      }

      const keyInfo = rows[0] as AzureKey;

      // Update key information
      await connection.execute(
        'UPDATE azure_keys SET keyname = ?, region = ? WHERE `key` = ?',
        [keyname, region, key]
      );

      // Log the action
      await this.logAction(connection, keyInfo.id!, LogAction.SET_STATUS, 200, `Key updated: keyname=${keyname}, region=${region}`);

      await connection.commit();

      const updatedKey: AzureKey = {
        ...keyInfo,
        keyname,
        region
      };

      logger.info(`Key updated: ${this.maskKey(key)}`);
      return updatedKey;
    } catch (error) {
      await connection.rollback();
      logger.error('Error updating key:', error);
      throw error;
    } finally {
      connection.release();
    }
  }

  /**
   * Get all keys with their status
   */
  async getAllKeys(): Promise<AzureKey[]> {
    try {
      const [rows] = await this.db.execute<mysql.RowDataPacket[]>(
        'SELECT * FROM azure_keys ORDER BY created_at DESC'
      );

      return rows as AzureKey[];
    } catch (error) {
      logger.error('Error getting all keys:', error);
      throw error;
    }
  }

  /**
   * Get key logs with pagination
   */
  async getKeyLogs(page: number = 1, limit: number = 50): Promise<{ logs: KeyLog[], total: number }> {
    const offset = (page - 1) * limit;

    // Get total count
    const [countRows] = await this.db.execute<mysql.RowDataPacket[]>(
      'SELECT COUNT(*) as total FROM key_logs'
    );
    const total = countRows[0].total;

    // Get logs with key info
    const [rows] = await this.db.execute<mysql.RowDataPacket[]>(
      `SELECT kl.*, ak.keyname, ak.region
       FROM key_logs kl
       LEFT JOIN azure_keys ak ON kl.key_id = ak.id
       ORDER BY kl.created_at DESC
       LIMIT ${Number(limit)} OFFSET ${Number(offset)}`
    );

    return {
      logs: rows as KeyLog[],
      total
    };
  }

  /**
   * Log an action
   */
  private async logAction(
    connection: mysql.PoolConnection,
    keyId: number,
    action: LogAction,
    statusCode?: number,
    note?: string
  ): Promise<void> {
    await connection.execute(
      'INSERT INTO key_logs (key_id, action, status_code, note) VALUES (?, ?, ?, ?)',
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
   * Sync database and Redis cooldown states
   */
  async syncCooldownStates(): Promise<void> {
    logger.info('Starting cooldown state synchronization...');

    try {
      // Get all keys with cooldown status from database
      const [rows] = await this.db.execute<mysql.RowDataPacket[]>(
        'SELECT * FROM azure_keys WHERE status = ?',
        [KeyStatus.COOLDOWN]
      );

      const cooldownKeysInDB = rows as AzureKey[];
      logger.info(`Found ${cooldownKeysInDB.length} keys in cooldown status in database`);

      // Check each key in Redis
      for (const keyInfo of cooldownKeysInDB) {
        const isInRedisCooldown = await this.cooldownManager.isKeyInCooldown(keyInfo.key);

        if (!isInRedisCooldown) {
          // Key is in cooldown in DB but not in Redis - enable it
          logger.info(`Key ${this.maskKey(keyInfo.key)} is in DB cooldown but not in Redis, enabling...`);
          await this.enableKeyFromCooldown(keyInfo.key);
        }
      }

      // Get all keys in Redis cooldown
      const redisStats = await this.cooldownManager.getStats();
      logger.info(`Found ${redisStats.totalCooldownKeys} keys in Redis cooldown`);

      logger.info('Cooldown state synchronization completed');
    } catch (error) {
      logger.error('Error during cooldown state synchronization:', error);
    }
  }

  /**
   * Cleanup resources
   */
  async cleanup(): Promise<void> {
    await this.cooldownManager.stop();
    logger.info('KeyManager cleanup completed');
  }
}

export default KeyManager;
