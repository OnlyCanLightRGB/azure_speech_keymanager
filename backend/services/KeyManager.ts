import mysql from 'mysql2/promise';
import { AzureKey, KeyStatus, LogAction, KeyLog } from '../types';
import logger from '../utils/logger';
import RedisCooldownManager from './RedisCooldownManager';
import RedisLockService from './RedisLockService';
import RoundRobinKeyManager from './RoundRobinKeyManager';
import FeishuNotificationService from './FeishuNotificationService';

export class KeyManager {
  private db: mysql.Pool;
  private cooldownManager: RedisCooldownManager;
  private lockService: RedisLockService;
  private roundRobinManager: RoundRobinKeyManager;
  private feishuNotificationService: FeishuNotificationService;

  constructor(database: mysql.Pool) {
    this.db = database;
    this.lockService = new RedisLockService();
    this.cooldownManager = new RedisCooldownManager(this, 'speech');
    this.roundRobinManager = new RoundRobinKeyManager(database, this.cooldownManager, this.lockService);
    this.cooldownManager.start();
    
    // 初始化飞书通知服务，配置将在运行时从数据库读取
    this.feishuNotificationService = new FeishuNotificationService({
      enabled: false,
      webhookUrl: ''
    });
    
    // 异步初始化飞书通知配置
    this.initFeishuConfig();
  }

  private async initFeishuConfig(): Promise<void> {
    try {
      const enabled = await this.getConfigValue('feishu_notification_enabled', 'false') === 'true';
      const webhookUrl = await this.getConfigValue('feishu_webhook_url', '');
      
      this.feishuNotificationService.updateConfig({
        enabled,
        webhookUrl
      });
      
      logger.info(`Feishu notification initialized: enabled=${enabled}, webhookUrl=${webhookUrl ? 'configured' : 'not configured'}`);
    } catch (error) {
      logger.error('Failed to initialize Feishu notification config:', error);
    }
  }

  /**
   * Select key with priority-based strategy (normal keys first, then fallback keys)
   */
  private async selectKeyWithPriority(normalKeys: AzureKey[], fallbackKeys: AzureKey[], region: string, currentActiveKey?: string | null): Promise<AzureKey | null> {
    // First try normal keys
    const selectedNormalKey = await this.selectKeyFromPool(normalKeys, region, currentActiveKey, 'normal');
    if (selectedNormalKey) {
      return selectedNormalKey;
    }

    // If no normal keys available, try fallback keys
    if (fallbackKeys.length > 0) {
      logger.warn(`All normal keys for region ${region} are in cooldown, trying fallback keys`);
      const selectedFallbackKey = await this.selectKeyFromPool(fallbackKeys, region, currentActiveKey, 'fallback');
      if (selectedFallbackKey) {
        logger.info(`Using fallback key: ${this.maskKey(selectedFallbackKey.key)} (priority_weight: ${selectedFallbackKey.priority_weight || 0})`);
        return selectedFallbackKey;
      }
    }

    return null;
  }

  /**
   * Select key from a specific pool using sticky strategy
   */
  private async selectKeyFromPool(keys: AzureKey[], region: string, currentActiveKey?: string | null, keyType: 'normal' | 'fallback' = 'normal'): Promise<AzureKey | null> {
    if (keys.length === 0) return null;

    // If there's a current active key in this pool and it's not in cooldown, continue using it
    if (currentActiveKey) {
      const activeKeyInfo = keys.find(k => k.key === currentActiveKey);
      if (activeKeyInfo) {
        const isInCooldown = await this.cooldownManager.isKeyInCooldown(currentActiveKey);
        if (!isInCooldown) {
          logger.info(`Continuing with active ${keyType} key: ${this.maskKey(currentActiveKey)} (usage: ${activeKeyInfo.usage_count})`);
          return activeKeyInfo;
        }
      }
    }

    // Find next available key in sequence
    let currentActiveKeyId = 0;
    if (currentActiveKey) {
      const activeKeyInfo = keys.find(k => k.key === currentActiveKey);
      if (activeKeyInfo && activeKeyInfo.id) {
        currentActiveKeyId = activeKeyInfo.id;
      }
    }

    // Try to find the next key in sequence (higher ID) that's not in cooldown
    for (const key of keys) {
      if (key.id && key.id > currentActiveKeyId) {
        const isInCooldown = await this.cooldownManager.isKeyInCooldown(key.key);
        if (!isInCooldown) {
          await this.cooldownManager.setActiveKey(region, key.key);
          logger.info(`Selected next sequential ${keyType} key: ${this.maskKey(key.key)} (ID: ${key.id})`);
          return key;
        }
      }
    }

    // If no higher ID key is available, wrap around to the beginning
    for (const key of keys) {
      const isInCooldown = await this.cooldownManager.isKeyInCooldown(key.key);
      if (!isInCooldown && (!currentActiveKey || key.key !== currentActiveKey)) {
        await this.cooldownManager.setActiveKey(region, key.key);
        logger.info(`Selected wrapped-around ${keyType} key: ${this.maskKey(key.key)} (ID: ${key.id || 'unknown'})`);
        return key;
      }
    }

    // Final fallback: if all keys are in cooldown except the recently cooled one
    if (currentActiveKey) {
      const fallbackKey = keys.find(k => k.key === currentActiveKey);
      if (fallbackKey && !(await this.cooldownManager.isKeyInCooldown(fallbackKey.key))) {
        await this.cooldownManager.setActiveKey(region, fallbackKey.key);
        logger.info(`Using recently cooled ${keyType} key as final fallback: ${this.maskKey(fallbackKey.key)}`);
        return fallbackKey;
      }
    }

    return null;
  }

  /**
   * Get an available key for the specified region
   */
  async getKey(region: string = 'eastasia', tag: string = ''): Promise<AzureKey | null> {
    // 检查轮换策略配置
    const rotationStrategy = await this.getConfigValue('key_rotation_strategy', 'sticky');
    console.log(`[DEBUG] Key rotation strategy: ${rotationStrategy}`);

    // 如果配置为轮询策略，使用RoundRobinKeyManager
    if (rotationStrategy === 'round_robin') {
      console.log('[DEBUG] Using round-robin key selection strategy');
      return await this.roundRobinManager.getKeyWithRoundRobin(region, tag);
    }
    
    logger.info('Using sticky key selection strategy');
    
    // 默认使用粘性策略
    const lockKey = `getkey:${region}`;

    return await this.lockService.withLock(lockKey, async () => {
      const connection = await this.db.getConnection();

      try {
        await connection.beginTransaction();

        // Find available keys with priority-based selection
        // Priority: 1. Normal keys (priority_weight > 0) 2. Fallback keys (priority_weight = 0)
        // Within each priority level: Sequential ID order for proper rotation
        const [rows] = await connection.execute<mysql.RowDataPacket[]>(
          `SELECT * FROM azure_keys
           WHERE status = ? AND region = ?
           ORDER BY priority_weight DESC, id ASC
           FOR UPDATE`,
          [KeyStatus.ENABLED, region]
        );

        if (rows.length === 0) {
          await connection.rollback();
          logger.warn(`No available keys found for region: ${region}`);
          return null;
        }

        // Implement sticky key selection strategy with fallback key support
        let selectedKey: AzureKey | null = null;
        const keys = rows as AzureKey[];

        // Separate normal keys and fallback keys
        const normalKeys = keys.filter(k => (k.priority_weight || 1) > 0);
        const fallbackKeys = keys.filter(k => (k.priority_weight || 1) === 0);

        // Get current active key for this region
        const currentActiveKey = await this.cooldownManager.getActiveKey(region);

        // Use priority-based key selection
        selectedKey = await this.selectKeyWithPriority(normalKeys, fallbackKeys, region, currentActiveKey);


        if (!selectedKey) {
          await connection.rollback();
          logger.warn(`All available keys (including fallback keys) for region ${region} are in cooldown`);
          return null;
        }

        // Update usage statistics for selected key
        await connection.execute(
          `UPDATE azure_keys
           SET usage_count = usage_count + 1, last_used = NOW()
           WHERE id = ?`,
          [selectedKey.id]
        );

        // Log the action
        await this.logAction(connection, selectedKey.id!, LogAction.GET_KEY, 200, `Retrieved for region: ${region}, tag: ${tag}`);

        await connection.commit();

        const keyType = (selectedKey.priority_weight || 1) === 0 ? 'fallback' : 'normal';
        logger.info(`${keyType.charAt(0).toUpperCase() + keyType.slice(1)} key retrieved: ${this.maskKey(selectedKey.key)} for region: ${region} (priority_weight: ${selectedKey.priority_weight || 1}, usage_count: ${(selectedKey.usage_count || 0) + 1})`);
        return selectedKey;

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

              // Clear active key status for this key's region when disabled
              await this.clearActiveKeyForKey(key);

              logger.warn(`Key ${this.maskKey(key)} disabled due to error code: ${code}`);
              
              // 发送401错误的飞书通知
              if (code === 401) {
                try {
                  // 获取通知消息模板
                  const template = await this.getConfigValue('feishu_notification_template', 
                    '🚨 Azure密钥401错误警报\n\n密钥ID: {keyId}\n密钥名称: {keyName}\n服务类型: {service}\n错误时间: {timestamp}\n\n该密钥已被自动禁用，请检查密钥状态并及时更换。'
                  );
                  
                  // 替换模板变量
                  const message = template
                    .replace('{keyId}', this.maskKey(key))
                    .replace('{keyName}', keyInfo.keyname || '未命名')
                    .replace('{service}', 'Azure语音服务')
                    .replace('{timestamp}', new Date().toLocaleString('zh-CN'));
                  
                  await this.feishuNotificationService.sendNotification('Azure密钥401错误警报', message);
                } catch (notificationError) {
                  logger.error('Failed to send Feishu notification for 401 error:', notificationError);
                }
              }
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

              // Clear active key status for this key's region to force switching to next available key
              await this.clearActiveKeyForKey(key);

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
  async addKey(key: string, region: string, keyname: string = '', priority_weight: number = 1): Promise<AzureKey> {
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
        'INSERT INTO azure_keys (`key`, region, keyname, status, priority_weight) VALUES (?, ?, ?, ?, ?)',
        [key, region, keyname || `Key-${Date.now()}`, KeyStatus.ENABLED, priority_weight]
      );

      const newKey: AzureKey = {
        id: result.insertId,
        key,
        region,
        keyname: keyname || `Key-${Date.now()}`,
        status: KeyStatus.ENABLED,
        priority_weight
      };

      // Log the action
      await this.logAction(connection, newKey.id!, LogAction.ADD_KEY, 200, `Added key for region: ${region}, priority_weight: ${priority_weight}`);

      await connection.commit();

      const keyType = priority_weight === 0 ? 'fallback' : 'normal';
      logger.info(`${keyType.charAt(0).toUpperCase() + keyType.slice(1)} key added: ${this.maskKey(key)} for region: ${region} (priority_weight: ${priority_weight})`);
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
   * Set key priority weight (0 = fallback, 1+ = normal)
   */
  async setKeyPriorityWeight(key: string, priority_weight: number): Promise<void> {
    const connection = await this.db.getConnection();

    try {
      await connection.beginTransaction();

      // Check if key exists
      const [existing] = await connection.execute<mysql.RowDataPacket[]>(
        'SELECT id FROM azure_keys WHERE `key` = ?',
        [key]
      );

      if (existing.length === 0) {
        throw new Error(`Key not found: ${this.maskKey(key)}`);
      }

      // Update priority weight
      await connection.execute(
        'UPDATE azure_keys SET priority_weight = ? WHERE `key` = ?',
        [priority_weight, key]
      );

      // Log the action
      const keyType = priority_weight === 0 ? 'fallback' : 'normal';
      await this.logAction(connection, existing[0].id, LogAction.SET_STATUS, 200, `Set key as ${keyType} (priority_weight: ${priority_weight})`);

      await connection.commit();

      logger.info(`Key ${this.maskKey(key)} set as ${keyType} (priority_weight: ${priority_weight})`);
    } catch (error) {
      await connection.rollback();
      logger.error('Error setting key priority weight:', error);
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
   * Clear active key status for a specific key (find its region and clear)
   */
  private async clearActiveKeyForKey(key: string): Promise<void> {
    try {
      // Get key info to find its region
      const [rows] = await this.db.execute<mysql.RowDataPacket[]>(
        'SELECT region FROM azure_keys WHERE `key` = ?',
        [key]
      );

      if (rows.length > 0) {
        const region = rows[0].region;
        await this.cooldownManager.clearActiveKey(region);
        logger.info(`Cleared active key status for region ${region} due to key ${this.maskKey(key)} status change`);
      }
    } catch (error) {
      logger.error(`Error clearing active key for key ${this.maskKey(key)}:`, error);
    }
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
