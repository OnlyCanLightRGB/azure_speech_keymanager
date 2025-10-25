import mysql from 'mysql2/promise';
import { TranslationKey, KeyStatus, LogAction, KeyLog } from '../types';
import logger from '../utils/logger';
import RedisCooldownManager from './RedisCooldownManager';
import RedisLockService from './RedisLockService';
import FeishuNotificationService from './FeishuNotificationService';

export class TranslationKeyManager {
  private db: mysql.Pool;
  private cooldownManager: RedisCooldownManager;
  private lockService: RedisLockService;
  private redis: any;
  private readonly ROUND_ROBIN_PREFIX = 'translation_round_robin:';
  private feishuNotificationService: FeishuNotificationService;

  constructor(database: mysql.Pool) {
    this.db = database;
    this.lockService = new RedisLockService();
    this.cooldownManager = new RedisCooldownManager(this, 'translation');
    // 使用与cooldownManager相同的redis实例
    this.redis = this.cooldownManager['redis'];
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
      
      logger.info(`Translation Feishu notification initialized: enabled=${enabled}, webhookUrl=${webhookUrl ? 'configured' : 'not configured'}`);
    } catch (error) {
      logger.error('Failed to initialize Translation Feishu notification config:', error);
    }
  }

  /**
   * Select key with priority-based strategy (normal keys first, then fallback keys)
   */
  private async selectKeyWithPriority(normalKeys: TranslationKey[], fallbackKeys: TranslationKey[], region: string, currentActiveKey?: string | null): Promise<TranslationKey | null> {
    // First try normal keys
    const selectedNormalKey = await this.selectKeyFromPool(normalKeys, region, currentActiveKey, 'normal');
    if (selectedNormalKey) {
      return selectedNormalKey;
    }

    // If no normal keys available, try fallback keys
    if (fallbackKeys.length > 0) {
      logger.warn(`All normal translation keys for region ${region} are in cooldown, trying fallback keys`);
      const selectedFallbackKey = await this.selectKeyFromPool(fallbackKeys, region, currentActiveKey, 'fallback');
      if (selectedFallbackKey) {
        logger.info(`Using fallback translation key: ${this.maskKey(selectedFallbackKey.key)} (priority_weight: ${selectedFallbackKey.priority_weight || 0})`);
        return selectedFallbackKey;
      }
    }

    return null;
  }

  /**
   * Select key from a specific pool using sticky strategy
   */
  private async selectKeyFromPool(keys: TranslationKey[], region: string, currentActiveKey?: string | null, keyType: 'normal' | 'fallback' = 'normal'): Promise<TranslationKey | null> {
    if (keys.length === 0) return null;

    // If there's a current active key in this pool and it's not in cooldown, continue using it
    if (currentActiveKey) {
      const activeKeyInfo = keys.find(k => k.key === currentActiveKey);
      if (activeKeyInfo) {
        const isInCooldown = await this.cooldownManager.isKeyInCooldown(currentActiveKey);
        if (!isInCooldown) {
          logger.info(`Continuing with active ${keyType} translation key: ${this.maskKey(currentActiveKey)} (usage: ${activeKeyInfo.usage_count})`);
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
          logger.info(`Selected next sequential ${keyType} translation key: ${this.maskKey(key.key)} (ID: ${key.id})`);
          return key;
        }
      }
    }

    // If no higher ID key is available, wrap around to the beginning
    for (const key of keys) {
      const isInCooldown = await this.cooldownManager.isKeyInCooldown(key.key);
      if (!isInCooldown && (!currentActiveKey || key.key !== currentActiveKey)) {
        await this.cooldownManager.setActiveKey(region, key.key);
        logger.info(`Selected wrapped-around ${keyType} translation key: ${this.maskKey(key.key)} (ID: ${key.id || 'unknown'})`);
        return key;
      }
    }

    // Final fallback: if all keys are in cooldown except the recently cooled one
    if (currentActiveKey) {
      const fallbackKey = keys.find(k => k.key === currentActiveKey);
      if (fallbackKey && !(await this.cooldownManager.isKeyInCooldown(fallbackKey.key))) {
        await this.cooldownManager.setActiveKey(region, fallbackKey.key);
        logger.info(`Using recently cooled ${keyType} translation key as final fallback: ${this.maskKey(fallbackKey.key)}`);
        return fallbackKey;
      }
    }

    return null;
  }

  /**
   * Get an available key for the specified region
   */
  async getKey(region: string = 'eastasia', tag: string = ''): Promise<TranslationKey | null> {
    // 检查轮换策略配置 - 与语音密钥使用统一的配置项
    const rotationStrategy = await this.getConfigValue('key_rotation_strategy', 'sticky');

    // 如果配置为轮询策略，使用轮询方法
    if (rotationStrategy === 'round_robin') {
      return await this.getKeyWithRoundRobin(region, tag);
    }
    
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
          `SELECT * FROM translation_keys
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
        let selectedKey: TranslationKey | null = null;
        const keys = rows as TranslationKey[];

        // Separate normal keys and fallback keys
        const normalKeys = keys.filter(k => (k.priority_weight || 1) > 0);
        const fallbackKeys = keys.filter(k => (k.priority_weight || 1) === 0);

        // Get current active key for this region
        const currentActiveKey = await this.cooldownManager.getActiveKey(region);

        // Use priority-based key selection
        selectedKey = await this.selectKeyWithPriority(normalKeys, fallbackKeys, region, currentActiveKey);


        if (!selectedKey) {
          await connection.rollback();
          logger.warn(`All available translation keys (including fallback keys) for region ${region} are in cooldown`);
          return null;
        }

        // Update usage statistics for selected key
        await connection.execute(
          `UPDATE translation_keys
           SET usage_count = usage_count + 1, last_used = NOW()
           WHERE id = ?`,
          [selectedKey.id]
        );

        // Log the action
        await this.logAction(connection, selectedKey.id!, LogAction.GET_KEY, 200, `Retrieved for region: ${region}, tag: ${tag}`);

        await connection.commit();

        const keyType = (selectedKey.priority_weight || 1) === 0 ? 'fallback' : 'normal';
        logger.info(`${keyType.charAt(0).toUpperCase() + keyType.slice(1)} translation key retrieved: ${this.maskKey(selectedKey.key)} for region: ${region} (priority_weight: ${selectedKey.priority_weight || 1}, usage_count: ${(selectedKey.usage_count || 0) + 1})`);
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
   * 使用轮询调度策略获取翻译密钥
   */
  async getKeyWithRoundRobin(region: string = 'eastasia', tag: string = ''): Promise<TranslationKey | null> {
    const lockKey = `translation_round_robin_getkey:${region}`;

    return await this.lockService.withLock(lockKey, async () => {
      const connection = await this.db.getConnection();

      try {
        await connection.beginTransaction();

        // 获取所有可用的翻译密钥，按优先级排序
        const [rows] = await connection.execute<mysql.RowDataPacket[]>(
          `SELECT * FROM translation_keys
           WHERE status = ? AND region = ?
           ORDER BY priority_weight DESC, id ASC
           FOR UPDATE`,
          [KeyStatus.ENABLED, region]
        );

        if (rows.length === 0) {
          await connection.rollback();
          logger.warn(`No available translation keys found for region: ${region}`);
          return null;
        }

        const keys = rows as TranslationKey[];

        // 分离普通key和保底key，并过滤掉冷却中的密钥
        const normalKeys: TranslationKey[] = [];
        const fallbackKeys: TranslationKey[] = [];

        for (const key of keys) {
          const isInCooldown = await this.cooldownManager.isKeyInCooldown(key.key);
          if (!isInCooldown) {
            if ((key.priority_weight || 1) > 0) {
              normalKeys.push(key);
            } else {
              fallbackKeys.push(key);
            }
          }
        }

        // 优先使用普通key，如果没有可用的普通key则使用保底key
        let availableKeys = normalKeys;
        let keyType = 'normal';

        if (normalKeys.length === 0 && fallbackKeys.length > 0) {
          availableKeys = fallbackKeys;
          keyType = 'fallback';
          logger.warn(`All normal translation keys for region ${region} are in cooldown, using fallback keys`);
        }

        if (availableKeys.length === 0) {
          await connection.rollback();
          logger.warn(`All available translation keys (including fallback keys) for region ${region} are in cooldown`);
          return null;
        }

        // 获取当前轮询索引，为不同类型的key使用不同的索引
        const roundRobinKey = `${this.ROUND_ROBIN_PREFIX}translation_${keyType}_${region}`;
        let currentIndex = 0;

        try {
          const indexStr = await this.redis.get(roundRobinKey);
          if (indexStr) {
            currentIndex = parseInt(indexStr, 10) || 0;
          }
        } catch (error) {
          logger.debug(`Error getting round robin index for ${keyType} translation keys in region ${region}:`, error);
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
          logger.debug(`Error setting round robin index for ${keyType} translation keys in region ${region}:`, error);
        }

        // 更新使用统计
        await connection.execute(
          `UPDATE translation_keys
           SET usage_count = usage_count + 1, last_used = NOW()
           WHERE id = ?`,
          [selectedKey.id]
        );

        // Log the action
        await this.logAction(connection, selectedKey.id!, LogAction.GET_KEY, 200, `Retrieved for region: ${region}, tag: ${tag} (round-robin)`);

        await connection.commit();

        logger.info(`Round-robin ${keyType} translation key selected: ${this.maskKey(selectedKey.key)} for region: ${region} (priority_weight: ${selectedKey.priority_weight || 1}, index: ${currentIndex}/${availableKeys.length}, usage_count: ${(selectedKey.usage_count || 0) + 1})`);
        return selectedKey;

      } catch (error) {
        await connection.rollback();
        logger.error('Error getting translation key with round-robin:', error);
        throw error;
      } finally {
        connection.release();
      }
    }, { ttl: 5000, retryCount: 3 });
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

            // Clear active key status for this key's region when disabled
            await this.clearActiveKeyForKey(key);

            logger.warn(`Translation key ${this.maskKey(key)} disabled due to error code: ${code}`);
            
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
                  .replace('{service}', 'Azure翻译服务')
                  .replace('{timestamp}', new Date().toLocaleString('zh-CN'));
                
                await this.feishuNotificationService.sendNotification('Azure密钥401错误警报', message);
              } catch (notificationError) {
                logger.error('Failed to send Feishu notification for 401 error:', notificationError);
              }
            }
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

              // Clear active key status for this key's region to force switching to next available key
              await this.clearActiveKeyForKey(key);

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
  async addKey(key: string, region: string, keyname: string = '', priority_weight: number = 1): Promise<TranslationKey> {
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
        'INSERT INTO translation_keys (`key`, region, keyname, status, priority_weight) VALUES (?, ?, ?, ?, ?)',
        [key, region, keyname || `TranslationKey-${Date.now()}`, KeyStatus.ENABLED, priority_weight]
      );

      const newKey: TranslationKey = {
        id: result.insertId,
        key,
        region,
        keyname: keyname || `TranslationKey-${Date.now()}`,
        status: KeyStatus.ENABLED,
        priority_weight
      };

      // Log the action
      await this.logAction(connection, newKey.id!, LogAction.ADD_KEY, 200, `Added translation key for region: ${region}, priority_weight: ${priority_weight}`);

      await connection.commit();

      const keyType = priority_weight === 0 ? 'fallback' : 'normal';
      logger.info(`${keyType.charAt(0).toUpperCase() + keyType.slice(1)} translation key added: ${this.maskKey(key)} for region: ${region} (priority_weight: ${priority_weight})`);
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
   * Set translation key priority weight (0 = fallback, 1+ = normal)
   */
  async setKeyPriorityWeight(key: string, priority_weight: number): Promise<void> {
    const connection = await this.db.getConnection();

    try {
      await connection.beginTransaction();

      // Check if key exists
      const [existing] = await connection.execute<mysql.RowDataPacket[]>(
        'SELECT id FROM translation_keys WHERE `key` = ?',
        [key]
      );

      if (existing.length === 0) {
        throw new Error(`Translation key not found: ${this.maskKey(key)}`);
      }

      // Update priority weight
      await connection.execute(
        'UPDATE translation_keys SET priority_weight = ? WHERE `key` = ?',
        [priority_weight, key]
      );

      // Log the action
      const keyType = priority_weight === 0 ? 'fallback' : 'normal';
      await this.logAction(connection, existing[0].id, LogAction.SET_STATUS, 200, `Set translation key as ${keyType} (priority_weight: ${priority_weight})`);

      await connection.commit();

      logger.info(`Translation key ${this.maskKey(key)} set as ${keyType} (priority_weight: ${priority_weight})`);
    } catch (error) {
      await connection.rollback();
      logger.error('Error setting translation key priority weight:', error);
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
   * Clear active key status for a specific key's region
   */
  private async clearActiveKeyForKey(key: string): Promise<void> {
    try {
      // Get key info to find its region
      const [rows] = await this.db.execute<mysql.RowDataPacket[]>(
        'SELECT region FROM translation_keys WHERE `key` = ?',
        [key]
      );

      if (rows.length > 0) {
        const region = rows[0].region;
        await this.cooldownManager.clearActiveKey(region);
        logger.info(`Cleared active translation key status for region ${region} due to key ${this.maskKey(key)} status change`);
      }
    } catch (error) {
      logger.error(`Error clearing active translation key for key ${this.maskKey(key)}:`, error);
    }
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
  getConcurrencyManager(): RedisCooldownManager {
    return this.cooldownManager;
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
    logger.info('TranslationKeyManager cleanup completed');
  }
}

export default TranslationKeyManager;
