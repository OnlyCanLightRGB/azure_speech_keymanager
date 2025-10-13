import { BillingService } from './BillingService';
import { SchedulerService } from './SchedulerService';
import axios from 'axios';

interface FeishuNotificationService {
  isEnabled(): boolean;
  sendNotification(title: string, content: string): Promise<void>;
}
import mysql from 'mysql2/promise';
import logger from '../utils/logger';
import * as fs from 'fs';
import * as path from 'path';
import { spawn } from 'child_process';

export interface JsonCredential {
  appId: string;
  displayName: string;
  password: string;
  tenant: string;
  filePath?: string;
  lastModified?: Date;
}

export interface JsonBillingRecord {
  id?: number;
  fileName: string;
  configName?: string;
  filePath: string;
  appId: string;
  tenantId: string;
  displayName: string;
  queryDate: Date;
  subscriptionId?: string;
  totalCost?: number;
  currency?: string;
  billingData?: string;
  queryStatus: 'success' | 'failed' | 'no_subscription';
  errorMessage?: string;
  lastModified: Date;
}

export interface BillingSubscription {
  id: number;
  subscriptionId: string;
  subscriptionName: string;
  tenantId?: string;
  status: 'active' | 'inactive' | 'suspended';
  autoQueryEnabled: boolean;
  queryIntervalHours: number;
  queryIntervalMinutes: number;
  lastQueryTime?: Date;
  nextQueryTime?: Date;
}

export interface BillingHistoryRecord {
  id?: number;
  subscriptionId: string;
  queryDate: Date;
  periodStart: Date;
  periodEnd: Date;
  totalCost?: number;
  currency?: string;
  speechCost?: number;
  translationCost?: number;
  otherCost?: number;
  usageCount?: number;
  resourceCount?: number;
  rawData?: string;
  anomaliesDetected: boolean;
  anomalyDetails?: string;
  queryStatus: 'success' | 'failed' | 'partial';
  errorMessage?: string;
}

export interface BillingAlert {
  subscriptionId: string;
  alertType: 'cost_threshold' | 'usage_anomaly' | 'query_failure' | 'resource_spike';
  severity: 'low' | 'medium' | 'high' | 'critical';
  title: string;
  message: string;
  thresholdValue?: number;
  actualValue?: number;
  resourceId?: string;
}

export interface JsonBillingConfig {
  id?: number;
  configName: string;
  fileName: string;
  filePath: string;
  appId: string;
  tenantId: string;
  displayName: string;
  password: string;
  autoQueryEnabled: boolean;
  queryIntervalMinutes: number;
  lastQueryTime?: Date;
  nextQueryTime?: Date;
  status: 'active' | 'inactive' | 'error';
  errorMessage?: string;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface JsonBillingSchedule {
  id?: number;
  configId: number;
  scheduledTime: Date;
  executionTime?: Date;
  status: 'pending' | 'running' | 'completed' | 'failed';
  resultMessage?: string;
  billingHistoryId?: number;
  createdAt?: Date;
  updatedAt?: Date;
}

export class AutoBillingService {
  private billingService: BillingService;
  private schedulerService: SchedulerService;
  private feishuService: FeishuNotificationService;
  private connection: mysql.Pool;
  private isInitialized = false;
  private scheduledTaskId?: string;
  private jsonQueryTaskId?: string;
  private jsonDirectory: string;
  // 新增：存储每个配置的独立定时器
  private individualTimers: Map<number, NodeJS.Timeout> = new Map();

  constructor(
    billingService: BillingService,
    schedulerService: SchedulerService,
    feishuService: FeishuNotificationService,
    connection: mysql.Pool
  ) {
    this.billingService = billingService;
    this.schedulerService = schedulerService;
    this.feishuService = feishuService;
    this.connection = connection;
    this.jsonDirectory = path.join(process.cwd(), 'json');

    // 启动时恢复定时器（延迟执行以确保数据库连接就绪）
    setTimeout(() => {
      this.initializeTimers();
    }, 5000);
  }

  /**
   * 初始化定时器 - 在服务启动时恢复所有活跃的定时器配置
   */
  private async initializeTimers(): Promise<void> {
    try {
      console.log('Initializing timers from database...');

      // 首先清理无效状态
      await this.cleanupInvalidStates();

      // 获取所有活跃的JSON配置
      const configs = await this.getJsonConfigs('active');
      console.log(`Found ${configs.length} active JSON configurations`);

      // 为每个启用自动查询的配置创建定时器
      for (const config of configs) {
        if (config.autoQueryEnabled) {
          console.log(`Restoring timer for config: ${config.configName} (ID: ${config.id})`);
          await this.addJsonConfigTimer(config);
        }
      }

      console.log('Timer initialization completed');
    } catch (error) {
      console.error('Error initializing timers:', error);
    }
  }

  /**
   * 清理无效状态 - 在服务启动时清理数据库中的无效状态
   */
  private async cleanupInvalidStates(): Promise<void> {
    try {
      console.log('Cleaning up invalid states...');
      const connection = await this.connection.getConnection();

      try {
        // 清理没有对应文件的配置
        const cleanupQuery = `
          UPDATE json_billing_configs
          SET status = 'inactive', updated_at = NOW()
          WHERE status = 'active'
            AND file_path IS NOT NULL
            AND file_path != ''
            AND file_path NOT LIKE '/app/json/%'
        `;

        const [result] = await connection.execute(cleanupQuery);
        const updateResult = result as any;

        if (updateResult.affectedRows > 0) {
          console.log(`Cleaned up ${updateResult.affectedRows} invalid configurations`);
        }

        // 重置过期的定时器状态
        const resetQuery = `
          UPDATE json_billing_configs
          SET next_query_time = CASE
            WHEN auto_query_enabled = 1 THEN DATE_ADD(NOW(), INTERVAL query_interval_minutes MINUTE)
            ELSE NULL
          END,
          updated_at = NOW()
          WHERE status = 'active'
            AND auto_query_enabled = 1
            AND (next_query_time IS NULL OR next_query_time < NOW())
        `;

        const [resetResult] = await connection.execute(resetQuery);
        const resetUpdateResult = resetResult as any;

        if (resetUpdateResult.affectedRows > 0) {
          console.log(`Reset ${resetUpdateResult.affectedRows} timer states`);
        }

      } finally {
        connection.release();
      }

      console.log('State cleanup completed');
    } catch (error) {
      console.error('Error during state cleanup:', error);
    }
  }

  /**
   * 获取Azure访问令牌
   */
  private async getAzureAccessToken(credential: JsonCredential): Promise<string | null> {
    try {
      const tokenUrl = `https://login.microsoftonline.com/${credential.tenant}/oauth2/v2.0/token`;
      
      const params = new URLSearchParams();
      params.append('client_id', credential.appId);
      params.append('client_secret', credential.password);
      params.append('scope', 'https://management.azure.com/.default');
      params.append('grant_type', 'client_credentials');

      const response = await axios.post(tokenUrl, params, {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded'
        }
      });

      if (response.data && response.data.access_token) {
        return response.data.access_token;
      }

      logger.error('Failed to get access token: No token in response');
      return null;

    } catch (error) {
      logger.error('Failed to get Azure access token:', error);
      return null;
    }
  }

  /**
   * 发现可用的Azure订阅
   */
  private async discoverSubscriptions(accessToken: string): Promise<Array<{subscriptionId: string, displayName: string}> | null> {
    try {
      const subscriptionsUrl = 'https://management.azure.com/subscriptions?api-version=2020-01-01';
      
      const response = await axios.get(subscriptionsUrl, {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        }
      });

      if (response.data && response.data.value) {
        return response.data.value.map((sub: any) => ({
          subscriptionId: sub.subscriptionId,
          displayName: sub.displayName || sub.subscriptionId
        }));
      }

      return [];

    } catch (error) {
      logger.error('Failed to discover Azure subscriptions:', error);
      return null;
    }
  }

  /**
   * 查询订阅的账单信息
   */
  private async querySubscriptionBilling(accessToken: string, subscriptionId: string): Promise<any | null> {
    try {
      // 获取当前月份的成本数据
      const now = new Date();
      const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
      const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0);
      
      const costUrl = `https://management.azure.com/subscriptions/${subscriptionId}/providers/Microsoft.CostManagement/query?api-version=2021-10-01`;
      
      const queryBody = {
        type: 'ActualCost',
        timeframe: 'Custom',
        timePeriod: {
          from: startOfMonth.toISOString().split('T')[0],
          to: endOfMonth.toISOString().split('T')[0]
        },
        dataset: {
          granularity: 'Daily',
          aggregation: {
            totalCost: {
              name: 'PreTaxCost',
              function: 'Sum'
            }
          },
          grouping: [
            {
              type: 'Dimension',
              name: 'ServiceName'
            }
          ]
        }
      };

      const response = await axios.post(costUrl, queryBody, {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        }
      });

      if (response.data && response.data.properties) {
        const rows = response.data.properties.rows || [];
        let totalCost = 0;
        let currency = 'USD';
        
        // 计算总成本
        rows.forEach((row: any[]) => {
          if (row && row.length > 0) {
            totalCost += parseFloat(row[0]) || 0;
          }
        });

        // 尝试获取货币信息
        if (response.data.properties.columns) {
          const currencyColumn = response.data.properties.columns.find((col: any) => 
            col.name === 'Currency' || col.name === 'BillingCurrency'
          );
          if (currencyColumn && rows.length > 0 && rows[0].length > currencyColumn.ordinal) {
            currency = rows[0][currencyColumn.ordinal] || 'USD';
          }
        }

        return {
          totalCost,
          currency,
          rawData: response.data,
          queryDate: new Date().toISOString()
        };
      }

      return null;

    } catch (error) {
      logger.error(`Failed to query billing for subscription ${subscriptionId}:`, error);
      return null;
    }
  }

  /**
   * 初始化自动账单查询服务
   */
  async initialize(): Promise<void> {
    try {
      // 启动定时任务
      await this.startAutoQueryScheduler();
      // 启动JSON文件查询任务
      await this.startJsonQueryScheduler();
      this.isInitialized = true;
      logger.info('AutoBillingService initialized successfully');
    } catch (error) {
      logger.error('Failed to initialize AutoBillingService:', error);
      throw error;
    }
  }

  /**
   * 启动JSON文件自动查询调度器
   */
  private async startJsonQueryScheduler(): Promise<void> {
    // 为每个活跃的JSON配置创建独立的定时器
    await this.initializeIndividualTimers();
    
    logger.info('JSON config individual timers initialized');
  }

  /**
   * 初始化每个JSON配置的独立定时器
   */
  private async initializeIndividualTimers(): Promise<void> {
    try {
      // 获取所有活跃的JSON配置
      const activeConfigs = await this.getJsonConfigs('active');
      
      for (const config of activeConfigs) {
        if (config.autoQueryEnabled && config.id) {
          await this.createIndividualTimer(config);
        }
      }
      
      logger.info(`Initialized ${this.individualTimers.size} individual timers for JSON configs`);
    } catch (error) {
      logger.error('Failed to initialize individual timers:', error);
      throw error;
    }
  }

  /**
   * 为单个JSON配置创建独立定时器
   */
  private async createIndividualTimer(config: JsonBillingConfig): Promise<void> {
    if (!config.id) return;

    // 清除已存在的定时器
    this.clearIndividualTimer(config.id);

    // 计算下次执行的延迟时间
    const now = new Date();
    let nextExecutionTime: Date;
    
    if (config.nextQueryTime && new Date(config.nextQueryTime) > now) {
      // 如果数据库中有下次执行时间且未过期，使用该时间
      nextExecutionTime = new Date(config.nextQueryTime);
    } else {
      // 否则从当前时间开始计算
      nextExecutionTime = new Date(now.getTime() + config.queryIntervalMinutes * 60 * 1000);
    }
    
    const delayMs = nextExecutionTime.getTime() - now.getTime();
    
    logger.info(`Creating timer for config ${config.id} (${config.configName}), next execution at ${nextExecutionTime.toISOString()}, delay: ${Math.round(delayMs / 1000)}s`);
    
    const scheduleNextExecution = async () => {
      try {
        logger.info(`Executing scheduled query for config ${config.id} (${config.configName})`);
        
        // 重新获取最新的配置信息，确保配置仍然有效
        const [configs] = await this.connection.execute(
          `SELECT id, config_name as configName, file_name as fileName, file_path as filePath,
                 app_id as appId, tenant_id as tenantId, display_name as displayName,
                 password, auto_query_enabled as autoQueryEnabled,
                 query_interval_minutes as queryIntervalMinutes,
                 last_query_time as lastQueryTime, next_query_time as nextQueryTime,
                 status, error_message as errorMessage,
                 created_at as createdAt, updated_at as updatedAt
           FROM json_billing_configs WHERE id = ? AND status = "active" AND auto_query_enabled = 1`,
          [config.id]
        );
        
        const configArray = configs as JsonBillingConfig[];
        if (configArray.length === 0) {
          logger.info(`Config ${config.id} is no longer active, clearing timer`);
          this.clearIndividualTimer(config.id!);
          return;
        }

        const currentConfig = configArray[0];
        await this.executeConfigAndScheduleNext(currentConfig);
      } catch (error) {
        logger.error(`Error executing scheduled query for config ${config.id}:`, error);
        // executeConfigAndScheduleNext 方法会处理定时器重新创建
      }
    };

    // 使用setTimeout创建精确定时器
    const timer = setTimeout(scheduleNextExecution, delayMs);

    // 存储定时器
    this.individualTimers.set(config.id, timer);
    
    logger.info(`Timer created for config ${config.id}, will execute at ${nextExecutionTime.toISOString()}`);
  }

  /**
   * 执行配置查询并安排下次执行
   */
  private async executeConfigAndScheduleNext(config: JsonBillingConfig): Promise<void> {
    if (!config.id) return;

    let scheduleId: number | null = null;
    
    try {
      // 创建调度记录
      scheduleId = await this.createJsonSchedule(config.id, new Date());
      
      // 更新调度状态为运行中
      await this.updateJsonScheduleStatus(scheduleId, 'running');
      
      // 执行查询
      await this.executeJsonConfigQuery(config);
      
      // 更新调度状态为完成
      await this.updateJsonScheduleStatus(scheduleId, 'completed', 'Query executed successfully');
      
      logger.info(`Successfully executed query for config ${config.id} (${config.configName})`);
      
    } catch (error) {
      logger.error(`Failed to execute query for config ${config.id}:`, error);
      
      // 更新调度记录为失败状态
      if (scheduleId) {
        try {
          await this.updateJsonScheduleStatus(scheduleId, 'failed', `Query failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
        } catch (scheduleError) {
          logger.error('Failed to update schedule record:', scheduleError);
        }
      }
    }
    
    // 无论成功还是失败，都要重新设置定时器以确保持续执行
    try {
      const [configs] = await this.connection.execute(
        `SELECT id, config_name as configName, file_name as fileName, file_path as filePath,
               app_id as appId, tenant_id as tenantId, display_name as displayName,
               password, auto_query_enabled as autoQueryEnabled,
               query_interval_minutes as queryIntervalMinutes,
               last_query_time as lastQueryTime, next_query_time as nextQueryTime,
               status, error_message as errorMessage,
               created_at as createdAt, updated_at as updatedAt
         FROM json_billing_configs WHERE id = ? AND status = "active" AND auto_query_enabled = 1`,
        [config.id]
      );
      
      const configArray = configs as JsonBillingConfig[];
      if (configArray.length > 0) {
        const currentConfig = configArray[0];
        
        // 更新配置的查询时间
        const now = new Date();
        const nextQueryTime = new Date(now.getTime() + currentConfig.queryIntervalMinutes * 60 * 1000);
        
        await this.updateJsonConfigQueryTime(config.id, currentConfig.queryIntervalMinutes);
        
        // 重新创建定时器，使用更新后的配置
        const updatedConfig = { ...currentConfig, lastQueryTime: now, nextQueryTime };
        await this.createIndividualTimer(updatedConfig);
        
        logger.info(`Timer reset for config ${config.id} with interval ${currentConfig.queryIntervalMinutes} minutes`);
      }
    } catch (timerError) {
      logger.error(`Failed to reset timer for config ${config.id}:`, timerError);
    }
  }

  /**
   * 安排下次执行
   */


  /**
   * 清除单个配置的定时器
   */
  private clearIndividualTimer(configId: number): void {
    const timer = this.individualTimers.get(configId);
    if (timer) {
      clearTimeout(timer); // 修复：使用clearTimeout而不是clearInterval
      this.individualTimers.delete(configId);
      logger.info(`Cleared timeout timer for config ${configId}`);
    }
  }

  /**
   * 清除所有独立定时器
   */
  private clearAllIndividualTimers(): void {
    for (const [configId, timer] of this.individualTimers) {
      clearTimeout(timer); // 修复：使用clearTimeout而不是clearInterval
      logger.info(`Cleared timeout timer for config ${configId}`);
    }
    this.individualTimers.clear();
  }

  /**
   * 检查并执行JSON配置的定期查询
   */
  private async checkAndExecuteJsonConfigQueries(): Promise<void> {
    // 这个方法已经不再需要，因为我们使用独立的定时器
    // 保留方法以防其他地方有调用，但不执行任何操作
    logger.debug('checkAndExecuteJsonConfigQueries called but skipped - using individual timers instead');
  }

  /**
   * 手动触发JSON配置查询
   */
  async triggerJsonConfigQueries(): Promise<void> {
    // 手动触发时，直接执行所有活跃配置的查询
    const activeConfigs = await this.getJsonConfigs('active');
    
    for (const config of activeConfigs) {
      if (config.autoQueryEnabled && config.id) {
        try {
          await this.executeConfigAndScheduleNext(config);
          logger.info(`Manually triggered query for config: ${config.configName}`);
        } catch (error) {
          logger.error(`Failed to manually trigger query for config ${config.configName}:`, error);
        }
      }
    }
  }

  /**
   * 添加新的JSON配置时创建定时器
   */
  async addJsonConfigTimer(config: JsonBillingConfig): Promise<void> {
    if (config.autoQueryEnabled && config.id) {
      // 如果配置没有nextQueryTime，先更新数据库
      if (!config.nextQueryTime) {
        const intervalMinutes = config.queryIntervalMinutes || 60;
        const nextQueryTime = new Date(Date.now() + intervalMinutes * 60 * 1000);

        const connection = await this.connection.getConnection();
        try {
          await connection.execute(
            'UPDATE json_billing_configs SET next_query_time = ? WHERE id = ?',
            [nextQueryTime, config.id]
          );
          // 更新配置对象
          config.nextQueryTime = nextQueryTime;
        } finally {
          connection.release();
        }
      }

      await this.createIndividualTimer(config);
    }
  }

  /**
   * 更新JSON配置时重新创建定时器
   */
  async updateJsonConfigTimer(configId: number): Promise<void> {
    // 清除旧定时器
    this.clearIndividualTimer(configId);
    
    // 获取更新后的配置
    const [configs] = await this.connection.execute(
      'SELECT * FROM json_billing_configs WHERE id = ? AND status = "active"',
      [configId]
    );
    
    const configArray = configs as JsonBillingConfig[];
    if (configArray.length > 0 && configArray[0].autoQueryEnabled) {
      await this.createIndividualTimer(configArray[0]);
    }
  }

  /**
   * 删除JSON配置时清除定时器
   */
  async removeJsonConfigTimer(configId: number): Promise<void> {
    this.clearIndividualTimer(configId);
  }

  /**
   * 检查并查询JSON文件中的账单信息
   */
  private async checkAndQueryJsonFiles(): Promise<void> {
    try {
      if (!fs.existsSync(this.jsonDirectory)) {
        logger.warn(`JSON directory does not exist: ${this.jsonDirectory}`);
        return;
      }

      const jsonFiles = fs.readdirSync(this.jsonDirectory)
        .filter(file => file.endsWith('.json'))
        .map(file => path.join(this.jsonDirectory, file));

      logger.info(`Found ${jsonFiles.length} JSON files to process`);

      for (const filePath of jsonFiles) {
        try {
          await this.processJsonFile(filePath);
        } catch (error) {
          logger.error(`Failed to process JSON file ${filePath}:`, error);
        }
      }
    } catch (error) {
      logger.error('Error in checkAndQueryJsonFiles:', error);
    }
  }

  /**
   * 处理单个JSON文件
   */
  private async processJsonFile(filePath: string): Promise<void> {
    try {
      const fileName = path.basename(filePath);
      const stats = fs.statSync(filePath);
      const lastModified = stats.mtime;

      // 检查是否需要查询（基于文件修改时间和上次查询时间）
      const shouldQuery = await this.shouldQueryJsonFile(fileName, lastModified);
      if (!shouldQuery) {
        logger.debug(`Skipping ${fileName} - already queried recently`);
        return;
      }

      // 读取JSON文件
      const content = fs.readFileSync(filePath, 'utf8');
      const credential = JSON.parse(content) as any;

      if (!this.isValidCredential(credential)) {
        logger.warn(`Invalid credential format in ${fileName}`);
        await this.saveJsonBillingRecord({
          fileName,
          configName: undefined, // 文件夹扫描的文件没有配置名称
          filePath,
          appId: credential?.appId || 'unknown',
          tenantId: credential?.tenant || 'unknown',
          displayName: credential?.displayName || 'unknown',
          queryDate: new Date(),
          queryStatus: 'failed',
          errorMessage: 'Invalid credential format',
          lastModified
        });
        return;
      }

      logger.info(`Processing JSON file: ${fileName} for tenant: ${credential.tenant}`);

      // 尝试获取订阅信息并查询账单
      await this.queryBillingForCredential(credential, fileName, filePath, lastModified, undefined);

    } catch (error) {
      logger.error(`Error processing JSON file ${filePath}:`, error);
      const fileName = path.basename(filePath);
      await this.saveJsonBillingRecord({
        fileName,
        configName: undefined, // 文件夹扫描的文件没有配置名称
        filePath,
        appId: 'unknown',
        tenantId: 'unknown',
        displayName: 'unknown',
        queryDate: new Date(),
        queryStatus: 'failed',
        errorMessage: error instanceof Error ? error.message : 'Unknown error',
        lastModified: new Date()
      });
    }
  }

  /**
   * 验证凭据格式
   */
  private isValidCredential(credential: any): credential is JsonCredential {
    return credential &&
           typeof credential.appId === 'string' &&
           typeof credential.displayName === 'string' &&
           typeof credential.password === 'string' &&
           typeof credential.tenant === 'string' &&
           credential.appId.trim() !== '' &&
           credential.tenant.trim() !== '';
  }

  /**
   * 检查是否应该查询JSON文件
   */
  private async shouldQueryJsonFile(fileName: string, lastModified: Date): Promise<boolean> {
    const connection = await this.connection.getConnection();
    try {
      const query = `
        SELECT query_date, last_modified
        FROM json_billing_history
        WHERE file_name = ?
        ORDER BY query_date DESC
        LIMIT 1
      `;

      const [rows] = await connection.execute(query, [fileName]);
      const records = rows as any[];

      if (records.length === 0) {
        return true; // 从未查询过
      }

      const lastRecord = records[0];
      const lastQueryDate = new Date(lastRecord.query_date);
      const lastRecordModified = new Date(lastRecord.last_modified);

      // 如果文件被修改了，或者距离上次查询超过6小时，则需要重新查询
      const sixHoursAgo = new Date(Date.now() - 6 * 60 * 60 * 1000);
      return lastModified > lastRecordModified || lastQueryDate < sixHoursAgo;

    } finally {
      connection.release();
    }
  }

  /**
   * 为凭据查询账单信息
   */
  private async queryBillingForCredential(
    credential: JsonCredential,
    fileName: string,
    filePath: string,
    lastModified: Date,
    configName?: string
  ): Promise<void> {
    try {
      logger.info(`Starting billing query for credential ${fileName} (${credential.appId})`);

      // 1. 获取Azure访问令牌
      const accessToken = await this.getAzureAccessToken(credential);
      if (!accessToken) {
        throw new Error('Failed to obtain Azure access token');
      }

      // 2. 发现可用订阅
      const subscriptions = await this.discoverSubscriptions(accessToken);
      if (!subscriptions || subscriptions.length === 0) {
        await this.saveJsonBillingRecord({
          fileName,
          configName,
          filePath,
          appId: credential.appId,
          tenantId: credential.tenant,
          displayName: credential.displayName,
          queryDate: new Date(),
          queryStatus: 'no_subscription',
          errorMessage: 'No accessible subscriptions found for this credential',
          lastModified
        });
        return;
      }

      logger.info(`Found ${subscriptions.length} subscriptions for ${credential.appId}`);

      // 3. 为每个订阅查询账单信息
      let totalCost = 0;
      let currency = 'USD';
      const billingResults: any[] = [];

      for (const subscription of subscriptions) {
        try {
          const billingData = await this.querySubscriptionBilling(accessToken, subscription.subscriptionId);
          if (billingData) {
            totalCost += billingData.totalCost || 0;
            currency = billingData.currency || currency;
            billingResults.push({
              subscriptionId: subscription.subscriptionId,
              subscriptionName: subscription.displayName,
              ...billingData
            });
          }
        } catch (subError) {
          logger.warn(`Failed to query billing for subscription ${subscription.subscriptionId}:`, subError);
        }
      }

      // 4. 保存查询结果
      const record: JsonBillingRecord = {
        fileName,
        configName,
        filePath,
        appId: credential.appId,
        tenantId: credential.tenant,
        displayName: credential.displayName,
        queryDate: new Date(),
        subscriptionId: subscriptions[0].subscriptionId, // 主要订阅
        totalCost: totalCost > 0 ? totalCost : undefined,
        currency: totalCost > 0 ? currency : undefined,
        billingData: billingResults.length > 0 ? JSON.stringify(billingResults) : undefined,
        queryStatus: billingResults.length > 0 ? 'success' : 'no_subscription',
        errorMessage: billingResults.length === 0 ? 'No billing data found for accessible subscriptions' : undefined,
        lastModified
      };

      await this.saveJsonBillingRecord(record);
      logger.info(`Successfully recorded billing query for ${fileName}: ${billingResults.length} subscriptions, total cost: ${totalCost} ${currency}`);

    } catch (error) {
      logger.error(`Failed to query billing for credential ${fileName}:`, error);
      await this.saveJsonBillingRecord({
        fileName,
        configName,
        filePath,
        appId: credential.appId,
        tenantId: credential.tenant,
        displayName: credential.displayName,
        queryDate: new Date(),
        queryStatus: 'failed',
        errorMessage: error instanceof Error ? error.message : 'Unknown error',
        lastModified
      });
    }
  }

  /**
   * 保存JSON账单查询记录
   */
  async saveJsonBillingRecord(record: JsonBillingRecord): Promise<number> {
    const connection = await this.connection.getConnection();
    try {
      const query = `
        INSERT INTO json_billing_history (
          file_name, config_name, file_path, app_id, tenant_id, display_name,
          query_date, subscription_id, total_cost, currency,
          billing_data, query_status, error_message, last_modified
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `;

      const values = [
        record.fileName,
        record.configName || null,
        record.filePath,
        record.appId,
        record.tenantId,
        record.displayName,
        record.queryDate,
        record.subscriptionId || null,
        record.totalCost || null,
        record.currency || null,
        record.billingData || null,
        record.queryStatus,
        record.errorMessage || null,
        record.lastModified
      ];

      const [result] = await connection.execute(query, values);
      const insertResult = result as any;
      return insertResult.insertId;

    } finally {
      connection.release();
    }
  }

  /**
   * 获取JSON文件账单历史记录
   */
  async getJsonBillingHistory(
    fileName?: string,
    startDate?: Date,
    endDate?: Date,
    limit: number = 100
  ): Promise<JsonBillingRecord[]> {
    const connection = await this.connection.getConnection();
    try {
      let query = `
        SELECT id, file_name as fileName, config_name as configName, file_path as filePath,
               app_id as appId, tenant_id as tenantId, display_name as displayName,
               query_date as queryDate, subscription_id as subscriptionId,
               total_cost as totalCost, currency, billing_data as billingData,
               query_status as queryStatus, error_message as errorMessage,
               last_modified as lastModified
        FROM json_billing_history
        WHERE 1=1
      `;

      const params: any[] = [];

      if (fileName) {
        query += ' AND file_name = ?';
        params.push(fileName);
      }

      if (startDate) {
        query += ' AND query_date >= ?';
        params.push(startDate);
      }

      if (endDate) {
        query += ' AND query_date <= ?';
        params.push(endDate);
      }

      query += ' ORDER BY query_date DESC';
      
      // 直接在SQL中拼接LIMIT值，避免参数化查询的问题
      if (limit > 0) {
        // 确保limit是安全的整数值
        const safeLimit = Math.max(1, Math.min(1000, Math.floor(limit)));
        query += ` LIMIT ${safeLimit}`;
      }

      const [rows] = await connection.execute(query, params);
      return rows as JsonBillingRecord[];

    } catch (error) {
      logger.error('Error in getJsonBillingHistory:', error);
      throw error;
    } finally {
      connection.release();
    }
  }

  // JSON配置管理方法
  /**
   * 保存JSON配置
   */
  async saveJsonConfig(config: JsonBillingConfig): Promise<number> {
    const connection = await this.connection.getConnection();
    try {
      // 如果启用了自动查询，计算下次查询时间
      let nextQueryTime = null;
      if (config.autoQueryEnabled) {
        const intervalMinutes = config.queryIntervalMinutes || 60;
        nextQueryTime = new Date(Date.now() + intervalMinutes * 60 * 1000);
      }

      // 检查是否存在同名配置
      const checkQuery = 'SELECT id FROM json_billing_configs WHERE config_name = ? AND status = "active"';
      const [existingRows] = await connection.execute(checkQuery, [config.configName]);
      const existing = existingRows as any[];

      if (existing.length > 0) {
        // 如果存在同名配置，更新而不是插入
        console.log(`Updating existing config: ${config.configName}`);
        const updateQuery = `
          UPDATE json_billing_configs SET
            file_name = ?, file_path = ?, app_id = ?, tenant_id = ?, display_name = ?,
            password = ?, auto_query_enabled = ?, query_interval_minutes = ?,
            next_query_time = ?, updated_at = NOW()
          WHERE id = ?
        `;

        const updateValues = [
          config.fileName,
          config.filePath,
          config.appId,
          config.tenantId,
          config.displayName,
          config.password,
          config.autoQueryEnabled,
          config.queryIntervalMinutes,
          nextQueryTime,
          existing[0].id
        ];

        await connection.execute(updateQuery, updateValues);
        return existing[0].id;
      } else {
        // 插入新配置
        const insertQuery = `
          INSERT INTO json_billing_configs (
            config_name, file_name, file_path, app_id, tenant_id, display_name,
            password, auto_query_enabled, query_interval_minutes, next_query_time, status
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `;

        const insertValues = [
          config.configName,
          config.fileName,
          config.filePath,
          config.appId,
          config.tenantId,
          config.displayName,
          config.password,
          config.autoQueryEnabled,
          config.queryIntervalMinutes,
          nextQueryTime,
          config.status
        ];

        const [result] = await connection.execute(insertQuery, insertValues);
        const insertResult = result as any;
        return insertResult.insertId;
      }

    } finally {
      connection.release();
    }
  }

  /**
   * 获取JSON配置列表
   */
  async getJsonConfigs(status?: string): Promise<JsonBillingConfig[]> {
    const connection = await this.connection.getConnection();
    try {
      let query = `
        SELECT id, config_name as configName, file_name as fileName, file_path as filePath,
               app_id as appId, tenant_id as tenantId, display_name as displayName,
               password, auto_query_enabled as autoQueryEnabled, 
               query_interval_minutes as queryIntervalMinutes,
               last_query_time as lastQueryTime, next_query_time as nextQueryTime,
               status, error_message as errorMessage,
               created_at as createdAt, updated_at as updatedAt
        FROM json_billing_configs
        WHERE 1=1
      `;

      const params: any[] = [];

      if (status) {
        query += ' AND status = ?';
        params.push(status);
      }

      query += ' ORDER BY created_at DESC';

      const [rows] = await connection.execute(query, params);
      return rows as JsonBillingConfig[];

    } finally {
      connection.release();
    }
  }

  /**
   * 更新JSON配置
   */
  async updateJsonConfig(id: number, config: Partial<JsonBillingConfig>): Promise<void> {
    const connection = await this.connection.getConnection();
    try {
      const updateFields: string[] = [];
      const values: any[] = [];

      if (config.configName !== undefined) {
        updateFields.push('config_name = ?');
        values.push(config.configName);
      }
      if (config.fileName !== undefined) {
        updateFields.push('file_name = ?');
        values.push(config.fileName);
      }
      if (config.filePath !== undefined) {
        updateFields.push('file_path = ?');
        values.push(config.filePath);
      }
      if (config.appId !== undefined) {
        updateFields.push('app_id = ?');
        values.push(config.appId);
      }
      if (config.tenantId !== undefined) {
        updateFields.push('tenant_id = ?');
        values.push(config.tenantId);
      }
      if (config.displayName !== undefined) {
        updateFields.push('display_name = ?');
        values.push(config.displayName);
      }
      if (config.password !== undefined) {
        updateFields.push('password = ?');
        values.push(config.password);
      }
      if (config.autoQueryEnabled !== undefined) {
        updateFields.push('auto_query_enabled = ?');
        values.push(config.autoQueryEnabled);
      }
      if (config.queryIntervalMinutes !== undefined) {
        updateFields.push('query_interval_minutes = ?');
        values.push(config.queryIntervalMinutes);
      }
      if (config.status !== undefined) {
        updateFields.push('status = ?');
        values.push(config.status);
      }
      if (config.errorMessage !== undefined) {
        updateFields.push('error_message = ?');
        values.push(config.errorMessage);
      }

      if (updateFields.length === 0) {
        return;
      }

      updateFields.push('updated_at = CURRENT_TIMESTAMP');
      values.push(id);

      const query = `UPDATE json_billing_configs SET ${updateFields.join(', ')} WHERE id = ?`;
      await connection.execute(query, values);

    } finally {
      connection.release();
    }
  }

  /**
   * 删除JSON配置
   */
  async deleteJsonConfig(id: number): Promise<void> {
    const connection = await this.connection.getConnection();
    try {
      const query = 'DELETE FROM json_billing_configs WHERE id = ?';
      await connection.execute(query, [id]);
    } finally {
      connection.release();
    }
  }

  /**
   * 获取待查询的JSON配置
   */
  async getPendingJsonConfigs(): Promise<JsonBillingConfig[]> {
    const connection = await this.connection.getConnection();
    try {
      const query = `
        SELECT id, config_name as configName, file_name as fileName, file_path as filePath,
               app_id as appId, tenant_id as tenantId, display_name as displayName,
               password, auto_query_enabled as autoQueryEnabled, 
               query_interval_minutes as queryIntervalMinutes,
               last_query_time as lastQueryTime, next_query_time as nextQueryTime,
               status, error_message as errorMessage,
               created_at as createdAt, updated_at as updatedAt
        FROM json_billing_configs
        WHERE status = 'active' 
          AND auto_query_enabled = 1
          AND (next_query_time IS NULL OR next_query_time <= NOW())
      `;

      const [rows] = await connection.execute(query);
      return rows as JsonBillingConfig[];

    } finally {
      connection.release();
    }
  }

  /**
   * 执行JSON配置查询 - 使用Python脚本
   */
  async executeJsonConfigQuery(config: JsonBillingConfig): Promise<void> {
    // 安全日志：不记录敏感信息
    logger.info(`Executing JSON config query for: ${config.configName} (ID: ${config.id})`);

    try {
      // 检查文件路径是否有效
      if (!config.filePath) {
        throw new Error(`File path is undefined for config: ${config.configName}`);
      }

      // 读取JSON文件验证格式
      const content = fs.readFileSync(config.filePath, 'utf8');
      const credential = JSON.parse(content) as JsonCredential;

      if (!this.isValidCredential(credential)) {
        throw new Error('Invalid credential format');
      }

      // 调用Python脚本执行查询
      await this.runAzureBillingScript(config.filePath, config.fileName, config.configName);

      logger.info(`Successfully executed JSON config query for: ${config.configName}`);

    } catch (error) {
      logger.error(`Failed to execute JSON config query for ${config.configName}:`, error);
      throw error;
    }
  }

  /**
   * 创建JSON调度记录
   */
  private async createJsonSchedule(configId: number, scheduledTime: Date): Promise<number> {
    const connection = await this.connection.getConnection();
    try {
      const query = `
        INSERT INTO json_billing_schedules (config_id, scheduled_time, status)
        VALUES (?, ?, 'pending')
      `;

      const [result] = await connection.execute(query, [configId, scheduledTime]);
      const insertResult = result as any;
      return insertResult.insertId;

    } finally {
      connection.release();
    }
  }

  /**
   * 更新JSON调度状态
   */
  private async updateJsonScheduleStatus(
    scheduleId: number, 
    status: 'pending' | 'running' | 'completed' | 'failed',
    resultMessage?: string
  ): Promise<void> {
    const connection = await this.connection.getConnection();
    try {
      const query = `
        UPDATE json_billing_schedules 
        SET status = ?, result_message = ?, execution_time = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `;

      await connection.execute(query, [status, resultMessage || null, scheduleId]);

    } finally {
      connection.release();
    }
  }

  /**
   * 更新JSON配置查询时间
   */
  private async updateJsonConfigQueryTime(configId: number, intervalMinutes: number): Promise<void> {
    const connection = await this.connection.getConnection();
    try {
      // 确保间隔时间有效，避免产生无效日期
      const validIntervalMinutes = Math.max(1, intervalMinutes || 60); // 默认60分钟
      const nextQueryTime = new Date(Date.now() + validIntervalMinutes * 60 * 1000);

      // 验证日期是否有效
      if (isNaN(nextQueryTime.getTime())) {
        logger.error(`Invalid next query time calculated for config ${configId}, using default 60 minutes`);
        nextQueryTime.setTime(Date.now() + 60 * 60 * 1000);
      }

      const query = `
        UPDATE json_billing_configs
        SET last_query_time = CURRENT_TIMESTAMP, next_query_time = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `;

      await connection.execute(query, [nextQueryTime, configId]);

    } finally {
      connection.release();
    }
  }

  // 原有的其他方法保持不变...
  /**
   * 启动自动查询调度器
   */
  private async startAutoQueryScheduler(): Promise<void> {
    // 每分钟检查一次是否有需要查询的订阅
    this.scheduledTaskId = this.schedulerService.addTask({
      name: 'Auto Billing Query',
      interval: 60 * 1000, // 1分钟
      enabled: true,
      task: async () => {
        await this.checkAndExecuteQueries();
      }
    });

    logger.info(`Auto billing query scheduler started with task ID: ${this.scheduledTaskId}`);
  }

  /**
   * 检查并执行需要查询的订阅
   */
  private async checkAndExecuteQueries(): Promise<void> {
    try {
      const subscriptions = await this.getPendingSubscriptions();
      logger.info(`Found ${subscriptions.length} subscriptions pending query`);

      for (const subscription of subscriptions) {
        try {
          await this.executeSubscriptionQuery(subscription);
          await this.updateNextQueryTime(subscription);
        } catch (error) {
          logger.error(`Failed to query subscription ${subscription.subscriptionId}:`, error);
          await this.recordQueryFailure(subscription, error as Error);
        }
      }
    } catch (error) {
      logger.error('Error in checkAndExecuteQueries:', error);
    }
  }

  /**
   * 获取待查询的订阅列表
   */
  private async getPendingSubscriptions(): Promise<BillingSubscription[]> {
    const connection = await this.connection.getConnection();
    try {
      const query = `
        SELECT id, subscription_id as subscriptionId, subscription_name as subscriptionName,
               tenant_id as tenantId, status, auto_query_enabled as autoQueryEnabled,
               query_interval_hours as queryIntervalHours, query_interval_minutes as queryIntervalMinutes,
               last_query_time as lastQueryTime, next_query_time as nextQueryTime
        FROM billing_subscriptions
        WHERE status = 'active' 
          AND auto_query_enabled = 1
          AND (next_query_time IS NULL OR next_query_time <= NOW())
      `;

      const [rows] = await connection.execute(query);
      return rows as BillingSubscription[];
    } finally {
      connection.release();
    }
  }

  /**
   * 执行单个订阅的账单查询
   */
  private async executeSubscriptionQuery(subscription: BillingSubscription): Promise<void> {
    logger.info(`Executing billing query for subscription: ${subscription.subscriptionId}`);

    try {
      // 检查是否为测试订阅，使用模拟数据
      if (subscription.subscriptionId === 'test-subscription-001') {
        logger.info('Using mock data for test subscription');
        
        // 模拟账单数据
        const mockBillingStats = {
          totalCost: 125.50,
          currency: 'USD',
          speechCost: 85.30,
          translationCost: 25.20,
          otherCost: 15.00,
          usageCount: 1500
        };

        const mockCognitiveServices = [
          { resourceId: 'mock-speech-service-1', cost: 85.30, service: 'Speech' },
          { resourceId: 'mock-translation-service-1', cost: 25.20, service: 'Translation' }
        ];

        const mockUsageStats = {
          currentPeriod: {
            startDate: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(),
            endDate: new Date().toISOString()
          }
        };

        const mockAnomalies = {
          hasAnomalies: false,
          anomalies: []
        };

        // 保存历史记录
        const historyRecord: BillingHistoryRecord = {
          subscriptionId: subscription.subscriptionId,
          queryDate: new Date(),
          periodStart: new Date(mockUsageStats.currentPeriod.startDate),
          periodEnd: new Date(mockUsageStats.currentPeriod.endDate),
          totalCost: mockBillingStats.totalCost,
          currency: mockBillingStats.currency,
          speechCost: mockBillingStats.speechCost,
          translationCost: mockBillingStats.translationCost,
          otherCost: mockBillingStats.otherCost,
          usageCount: mockBillingStats.usageCount,
          resourceCount: mockCognitiveServices.length,
          rawData: JSON.stringify({ billingStats: mockBillingStats, cognitiveServices: mockCognitiveServices, usageStats: mockUsageStats }),
          anomaliesDetected: mockAnomalies.hasAnomalies,
          anomalyDetails: mockAnomalies.hasAnomalies ? JSON.stringify(mockAnomalies.anomalies) : undefined,
          queryStatus: 'success'
        };

        const historyId = await this.saveBillingHistory(historyRecord);
        await this.saveBillingResourceHistory(historyId, mockCognitiveServices);

        // 检查告警条件
        await this.checkAndCreateAlerts(subscription, historyRecord, mockAnomalies);

        logger.info(`Successfully queried billing for test subscription ${subscription.subscriptionId} using mock data`);
        return;
      }

      // 对于非测试订阅，使用真实的 BillingService
      const billingStats = await this.billingService.getRealTimeBillingStats(subscription.subscriptionId);
      const cognitiveServices = await this.billingService.getCognitiveServicesBilling(subscription.subscriptionId);
      const usageStats = await this.billingService.getUsageStatistics(subscription.subscriptionId);

      // 检查异常
      const anomalies = await this.billingService.checkBillingAnomalies(subscription.subscriptionId);

      // 保存历史记录
      const historyRecord: BillingHistoryRecord = {
        subscriptionId: subscription.subscriptionId,
        queryDate: new Date(),
        periodStart: new Date(usageStats.currentPeriod.startDate),
        periodEnd: new Date(usageStats.currentPeriod.endDate),
        totalCost: billingStats.totalCost,
        currency: billingStats.currency,
        speechCost: billingStats.speechCost,
        translationCost: billingStats.translationCost,
        otherCost: billingStats.otherCost,
        usageCount: billingStats.usageCount,
        resourceCount: cognitiveServices.length,
        rawData: JSON.stringify({ billingStats, cognitiveServices, usageStats }),
        anomaliesDetected: anomalies.hasAnomalies,
        anomalyDetails: anomalies.hasAnomalies ? JSON.stringify(anomalies.anomalies) : undefined,
        queryStatus: 'success'
      };

      const historyId = await this.saveBillingHistory(historyRecord);
      await this.saveBillingResourceHistory(historyId, cognitiveServices);

      // 检查告警条件
      await this.checkAndCreateAlerts(subscription, historyRecord, anomalies);

      logger.info(`Successfully queried billing for subscription ${subscription.subscriptionId}`);
    } catch (error) {
      logger.error(`Failed to query billing for subscription ${subscription.subscriptionId}:`, error);
      logger.error(`Error stack for subscription ${subscription.subscriptionId}:`, error instanceof Error ? error.stack : 'No stack trace');
      throw error;
    }
  }

  /**
   * 保存账单历史记录
   */
  private async saveBillingHistory(record: BillingHistoryRecord): Promise<number> {
    const connection = await this.connection.getConnection();
    try {
      logger.info(`Saving billing history for subscription ${record.subscriptionId}`);
      
      const query = `
        INSERT INTO billing_history (
          subscription_id, query_date, period_start, period_end, billing_period_start, billing_period_end,
          total_cost, currency, speech_cost, translation_cost, other_cost, usage_count, resource_count,
          raw_data, anomalies_detected, anomaly_details, query_status, error_message
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON DUPLICATE KEY UPDATE
          period_start = VALUES(period_start),
          period_end = VALUES(period_end),
          billing_period_start = VALUES(billing_period_start),
          billing_period_end = VALUES(billing_period_end),
          total_cost = VALUES(total_cost),
          currency = VALUES(currency),
          speech_cost = VALUES(speech_cost),
          translation_cost = VALUES(translation_cost),
          other_cost = VALUES(other_cost),
          usage_count = VALUES(usage_count),
          resource_count = VALUES(resource_count),
          raw_data = VALUES(raw_data),
          anomalies_detected = VALUES(anomalies_detected),
          anomaly_details = VALUES(anomaly_details),
          query_status = VALUES(query_status),
          error_message = VALUES(error_message),
          updated_at = CURRENT_TIMESTAMP
      `;

      // 格式化日期为 YYYY-MM-DD 格式
      const queryDate = record.queryDate.toISOString().split('T')[0];
      const periodStart = record.periodStart.toISOString().split('T')[0];
      const periodEnd = record.periodEnd.toISOString().split('T')[0];

      logger.info(`Query parameters: subscriptionId=${record.subscriptionId}, queryDate=${queryDate}, periodStart=${periodStart}, periodEnd=${periodEnd}`);

      const [result] = await connection.execute(query, [
        record.subscriptionId,
        queryDate,
        periodStart,
        periodEnd,
        periodStart,                     // billing_period_start 使用相同的值
        periodEnd,                       // billing_period_end 使用相同的值
        record.totalCost ?? null,        // 确保 undefined 转换为 null
        record.currency ?? null,         // 确保 undefined 转换为 null
        record.speechCost ?? null,       // 确保 undefined 转换为 null
        record.translationCost ?? null,  // 确保 undefined 转换为 null
        record.otherCost ?? null,        // 确保 undefined 转换为 null
        record.usageCount ?? null,       // 确保 undefined 转换为 null
        record.resourceCount ?? null,    // 确保 undefined 转换为 null
        record.rawData ?? null,          // 确保 undefined 转换为 null
        record.anomaliesDetected,
        record.anomalyDetails ?? null,   // 确保 undefined 转换为 null
        record.queryStatus,
        record.errorMessage ?? null      // 确保 undefined 转换为 null
      ]);

      logger.info(`Billing history saved successfully with ID: ${(result as any).insertId}`);
      return (result as any).insertId;
    } catch (error) {
      logger.error(`Failed to save billing history for subscription ${record.subscriptionId}:`, error);
      throw error;
    } finally {
      connection.release();
    }
  }

  /**
   * 保存账单资源历史详情
   */
  private async saveBillingResourceHistory(historyId: number, resources: any[]): Promise<void> {
    if (!resources || resources.length === 0) return;

    const connection = await this.connection.getConnection();
    try {
      const query = `
        INSERT INTO billing_resource_history (
          billing_history_id, resource_id, resource_name, resource_type,
          location, cost, currency, usage_breakdown
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `;

      for (const resource of resources) {
        await connection.execute(query, [
          historyId,
          resource.resourceId ?? null,
          resource.resourceName ?? null,
          resource.resourceType ?? null,
          resource.location ?? null,
          resource.totalCost ?? null,
          resource.currency ?? null,
          resource.usageBreakdown ? JSON.stringify(resource.usageBreakdown) : null
        ]);
      }
    } finally {
      connection.release();
    }
  }

  /**
   * 检查并创建告警
   */
  private async checkAndCreateAlerts(
    subscription: BillingSubscription,
    record: BillingHistoryRecord,
    anomalies: any
  ): Promise<void> {
    const alerts: BillingAlert[] = [];

    // 检查成本阈值告警
    const costThreshold = await this.getConfigValue('billing_cost_threshold', 100);
    if (record.totalCost && record.totalCost > costThreshold) {
      alerts.push({
        subscriptionId: subscription.subscriptionId,
        alertType: 'cost_threshold',
        severity: record.totalCost > costThreshold * 2 ? 'critical' : 'high',
        title: '账单成本超出阈值',
        message: `订阅 ${subscription.subscriptionId} 的账单成本 ${record.totalCost} ${record.currency || 'USD'} 超出了设定的阈值 ${costThreshold}`,
        thresholdValue: costThreshold,
        actualValue: record.totalCost
      });
    }

    // 检查异常告警
    if (anomalies.hasAnomalies) {
      alerts.push({
        subscriptionId: subscription.subscriptionId,
        alertType: 'usage_anomaly',
        severity: 'medium',
        title: '检测到使用异常',
        message: `订阅 ${subscription.subscriptionId} 检测到使用异常`,
        actualValue: record.totalCost
      });
    }

    // 保存并发送告警
    for (const alert of alerts) {
      await this.saveAlert(alert);
      await this.sendAlertNotification(alert);
    }
  }

  /**
   * 保存告警
   */
  private async saveAlert(alert: BillingAlert): Promise<void> {
    const connection = await this.connection.getConnection();
    try {
      const query = `
        INSERT INTO billing_alerts (
          subscription_id, alert_type, severity, title, message,
          threshold_value, actual_value, resource_id, is_resolved
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0)
      `;

      await connection.execute(query, [
        alert.subscriptionId,
        alert.alertType,
        alert.severity,
        alert.title,
        alert.message,
        alert.thresholdValue || null,
        alert.actualValue || null,
        alert.resourceId || null
      ]);

    } finally {
      connection.release();
    }
  }

  /**
   * 发送告警通知
   */
  private async sendAlertNotification(alert: BillingAlert): Promise<void> {
    try {
      if (this.feishuService.isEnabled()) {
        await this.feishuService.sendNotification(
          alert.title,
          alert.message
        );
        logger.info(`Alert notification sent for subscription ${alert.subscriptionId}`);
      }
    } catch (error) {
      logger.error('Failed to send alert notification:', error);
    }
  }

  /**
   * 更新下次查询时间
   */
  private async updateNextQueryTime(subscription: BillingSubscription): Promise<void> {
    const connection = await this.connection.getConnection();
    try {
      // 使用分钟为单位的查询间隔
      const intervalMinutes = subscription.queryIntervalMinutes || (subscription.queryIntervalHours * 60);
      const nextQueryTime = new Date(Date.now() + intervalMinutes * 60 * 1000);
      
      const query = `
        UPDATE billing_subscriptions 
        SET last_query_time = CURRENT_TIMESTAMP, next_query_time = ?
        WHERE id = ?
      `;

      await connection.execute(query, [nextQueryTime, subscription.id]);
    } finally {
      connection.release();
    }
  }

  /**
   * 记录查询失败
   */
  private async recordQueryFailure(subscription: BillingSubscription, error: Error): Promise<void> {
    const connection = await this.connection.getConnection();
    try {
      // 保存失败的历史记录
      const historyRecord: BillingHistoryRecord = {
        subscriptionId: subscription.subscriptionId,
        queryDate: new Date(),
        periodStart: new Date(),
        periodEnd: new Date(),
        totalCost: 0,
        currency: 'USD',
        speechCost: 0,
        translationCost: 0,
        otherCost: 0,
        usageCount: 0,
        resourceCount: 0,
        anomaliesDetected: false,
        queryStatus: 'failed',
        errorMessage: error.message
      };

      await this.saveBillingHistory(historyRecord);

      // 创建查询失败告警
      const alert: BillingAlert = {
        subscriptionId: subscription.subscriptionId,
        alertType: 'query_failure',
        severity: 'high',
        title: '账单查询失败',
        message: `订阅 ${subscription.subscriptionId} 的账单查询失败: ${error.message}`
      };

      await this.saveAlert(alert);
      await this.sendAlertNotification(alert);

    } finally {
      connection.release();
    }
  }

  /**
   * 获取配置值
   */
  private async getConfigValue(key: string, defaultValue: number): Promise<number> {
    const connection = await this.connection.getConnection();
    try {
      const query = 'SELECT config_value FROM system_config WHERE config_key = ?';
      const [rows] = await connection.execute(query, [key]);
      const records = rows as any[];

      if (records.length > 0) {
        const value = parseFloat(records[0].config_value);
        return isNaN(value) ? defaultValue : value;
      }

      return defaultValue;
    } catch (error) {
      logger.error(`Failed to get config value for ${key}:`, error);
      return defaultValue;
    } finally {
      connection.release();
    }
  }

  // 公共API方法
  async addSubscription(
    subscriptionId: string,
    subscriptionName: string,
    options: {
      tenantId?: string;
      autoQueryEnabled?: boolean;
      queryIntervalHours?: number;
    } = {}
  ): Promise<void> {
    const connection = await this.connection.getConnection();
    try {
      const query = `
        INSERT INTO billing_subscriptions (
          subscription_id, subscription_name, tenant_id, status,
          auto_query_enabled, query_interval_hours
        ) VALUES (?, ?, ?, 'active', ?, ?)
        ON DUPLICATE KEY UPDATE
          subscription_name = VALUES(subscription_name),
          tenant_id = VALUES(tenant_id),
          auto_query_enabled = VALUES(auto_query_enabled),
          query_interval_hours = VALUES(query_interval_hours),
          updated_at = CURRENT_TIMESTAMP
      `;

      await connection.execute(query, [
        subscriptionId,
        subscriptionName,
        options.tenantId || null,
        options.autoQueryEnabled !== false,
        options.queryIntervalHours || 24
      ]);

      logger.info(`Added/updated subscription: ${subscriptionId}`);
    } finally {
      connection.release();
    }
  }

  async getSubscriptions(): Promise<BillingSubscription[]> {
    const connection = await this.connection.getConnection();
    try {
      const query = `
        SELECT id, subscription_id as subscriptionId, subscription_name as subscriptionName,
               tenant_id as tenantId, status, auto_query_enabled as autoQueryEnabled,
               query_interval_hours as queryIntervalHours, last_query_time as lastQueryTime,
               next_query_time as nextQueryTime
        FROM billing_subscriptions
        ORDER BY subscription_name
      `;

      const [rows] = await connection.execute(query);
      return rows as BillingSubscription[];
    } finally {
      connection.release();
    }
  }

  async getBillingHistory(
    subscriptionId?: string,
    startDate?: Date,
    endDate?: Date,
    limit: number = 100
  ): Promise<BillingHistoryRecord[]> {
    const connection = await this.connection.getConnection();
    try {
      let query = `
        SELECT id, subscription_id as subscriptionId, query_date as queryDate,
               period_start as periodStart, period_end as periodEnd,
               total_cost as totalCost, currency, speech_cost as speechCost,
               translation_cost as translationCost, other_cost as otherCost,
               usage_count as usageCount, resource_count as resourceCount,
               raw_data as rawData, anomalies_detected as anomaliesDetected,
               anomaly_details as anomalyDetails, query_status as queryStatus,
               error_message as errorMessage
        FROM billing_history
        WHERE 1=1
      `;

      const params: any[] = [];

      if (subscriptionId) {
        query += ' AND subscription_id = ?';
        params.push(subscriptionId);
      }

      if (startDate) {
        query += ' AND query_date >= ?';
        params.push(startDate);
      }

      if (endDate) {
        query += ' AND query_date <= ?';
        params.push(endDate);
      }

      query += ' ORDER BY query_date DESC';
      
      // 直接在SQL中拼接LIMIT值，避免参数化查询的问题
      if (limit > 0) {
        // 确保limit是安全的整数值
        const safeLimit = Math.max(1, Math.min(1000, Math.floor(limit)));
        query += ` LIMIT ${safeLimit}`;
      }

      const [rows] = await connection.execute(query, params);
      return rows as BillingHistoryRecord[];
    } catch (error) {
      logger.error('Error in getBillingHistory:', error);
      throw error;
    } finally {
      connection.release();
    }
  }

  async getAlerts(
    subscriptionId?: string,
    isResolved?: boolean,
    limit: number = 50
  ): Promise<any[]> {
    const connection = await this.connection.getConnection();
    try {
      let query = `
        SELECT id, subscription_id as subscriptionId, alert_type as alertType,
               severity, title, message, threshold_value as thresholdValue,
               actual_value as actualValue, resource_id as resourceId,
               is_resolved as isResolved, created_at as createdAt
        FROM billing_alerts
        WHERE 1=1
      `;

      const params: any[] = [];

      if (subscriptionId) {
        query += ' AND subscription_id = ?';
        params.push(subscriptionId);
      }

      if (isResolved !== undefined) {
        query += ' AND is_resolved = ?';
        params.push(isResolved ? 1 : 0);
      }

      query += ' ORDER BY created_at DESC LIMIT ?';
      params.push(limit);

      const [rows] = await connection.execute(query, params);
      return rows as any[];
    } finally {
      connection.release();
    }
  }

  async triggerManualQuery(subscriptionId: string): Promise<void> {
    logger.info(`Triggering manual query for subscription: ${subscriptionId}`);
    
    const subscription = await this.getSubscriptionById(subscriptionId);
    if (!subscription) {
      logger.error(`Subscription not found: ${subscriptionId}`);
      throw new Error(`Subscription not found: ${subscriptionId}`);
    }

    logger.info(`Found subscription: ${JSON.stringify(subscription)}`);

    try {
      await this.executeSubscriptionQuery(subscription);
      await this.updateNextQueryTime(subscription);
      logger.info(`Manual query completed successfully for subscription: ${subscriptionId}`);
    } catch (error) {
      logger.error(`Error in manual query for subscription ${subscriptionId}:`, error);
      throw error;
    }
  }

  private async getSubscriptionById(subscriptionId: string): Promise<BillingSubscription | null> {
    const connection = await this.connection.getConnection();
    try {
      const query = `
        SELECT id, subscription_id as subscriptionId, subscription_name as subscriptionName,
               tenant_id as tenantId, status, auto_query_enabled as autoQueryEnabled,
               query_interval_hours as queryIntervalHours, query_interval_minutes as queryIntervalMinutes,
               last_query_time as lastQueryTime, next_query_time as nextQueryTime
        FROM billing_subscriptions
        WHERE subscription_id = ?
      `;

      const [rows] = await connection.execute(query, [subscriptionId]);
      const records = rows as BillingSubscription[];
      return records.length > 0 ? records[0] : null;
    } finally {
      connection.release();
    }
  }

  async stop(): Promise<void> {
    if (this.scheduledTaskId) {
      this.schedulerService.stopTask(this.scheduledTaskId);
      this.scheduledTaskId = undefined;
    }

    if (this.jsonQueryTaskId) {
      this.schedulerService.stopTask(this.jsonQueryTaskId);
      this.jsonQueryTaskId = undefined;
    }

    // 清除所有独立定时器
    this.clearAllIndividualTimers();

    this.isInitialized = false;
    logger.info('AutoBillingService stopped');
  }

  async getStatus(): Promise<{
    isRunning: boolean;
    nextScheduledRun?: string;
    lastRun?: string;
    totalSubscriptions: number;
    activeSubscriptions: number;
  }> {
    const connection = await this.connection.getConnection();
    try {
      // 获取订阅统计
      const [subscriptionStats] = await connection.execute(`
        SELECT 
          COUNT(*) as total,
          SUM(CASE WHEN status = 'active' THEN 1 ELSE 0 END) as active
        FROM billing_subscriptions
      `);

      const stats = (subscriptionStats as any[])[0];

      // 获取最近的查询时间
      const [lastRunResult] = await connection.execute(`
        SELECT MAX(query_date) as lastRun
        FROM billing_history
      `);

      const lastRun = (lastRunResult as any[])[0]?.lastRun;

      return {
        isRunning: this.isInitialized,
        lastRun: lastRun ? new Date(lastRun).toISOString() : undefined,
        totalSubscriptions: stats.total || 0,
        activeSubscriptions: stats.active || 0
      };
    } finally {
      connection.release();
    }
  }

  /**
   * 运行Azure账单查询Python脚本
   */
  private async runAzureBillingScript(credentialsPath: string, fileName: string, configName?: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const scriptPath = path.join(process.cwd(), 'az.py');
      logger.info(`Running Azure billing script: ${scriptPath} with credentials: ${credentialsPath}`);

      const pythonProcess = spawn('python3', [scriptPath, credentialsPath], {
        cwd: process.cwd()
      });

      let stdout = '';
      let stderr = '';

      pythonProcess.stdout.on('data', (data) => {
        stdout += data.toString();
        logger.info(`Python script output: ${data.toString().trim()}`);
      });

      pythonProcess.stderr.on('data', (data) => {
        stderr += data.toString();
        logger.warn(`Python script stderr: ${data.toString().trim()}`);
      });

      pythonProcess.on('close', async (code) => {
        if (code === 0) {
          logger.info(`Python script completed successfully for ${fileName}`);

          // 查找生成的汇总文件
          const summaryFile = path.join(process.cwd(), 'uploads', 'speech_service_costs_summary.json');
          if (fs.existsSync(summaryFile)) {
            try {
              const summaryData = JSON.parse(fs.readFileSync(summaryFile, 'utf8'));

              // 解析结果并保存到数据库
              await this.processPythonScriptResult(summaryData, fileName, credentialsPath, configName);

              logger.info(`Successfully processed Python script result for ${fileName}`);
              resolve();
            } catch (parseError) {
              logger.error(`Failed to parse Python script result: ${parseError}`);
              reject(new Error(`Failed to parse script result: ${parseError instanceof Error ? parseError.message : 'Unknown error'}`));
            }
          } else {
            logger.warn(`Summary file not found for ${fileName}, but script completed successfully`);
            resolve(); // 即使没有汇总文件也认为成功，可能是没有成本数据
          }
        } else {
          logger.error(`Python script failed for ${fileName} (exit code: ${code})`);
          logger.error(`Script stdout: ${stdout}`);
          logger.error(`Script stderr: ${stderr}`);
          reject(new Error(`Script execution failed (exit code: ${code})\nStdout: ${stdout}\nStderr: ${stderr}`));
        }
      });

      pythonProcess.on('error', (error: any) => {
        logger.error(`Failed to start Python script: ${error.message}`);
        reject(new Error(`Failed to start Python script: ${error.message}`));
      });
    });
  }

  /**
   * 处理Python脚本的结果并保存到数据库
   */
  private async processPythonScriptResult(summaryData: any, fileName: string, credentialsPath: string, configName?: string): Promise<void> {
    try {
      // 读取凭据文件获取基本信息
      const credentialContent = fs.readFileSync(credentialsPath, 'utf8');
      const credential = JSON.parse(credentialContent) as JsonCredential;

      let totalCost = 0;
      let currency = 'USD';
      let hasData = false;

      // 遍历所有订阅的成本数据
      for (const [subscriptionId, subscriptionData] of Object.entries(summaryData as any)) {
        if (subscriptionData && typeof subscriptionData === 'object' && 'cost_data' in subscriptionData) {
          const costData = (subscriptionData as any).cost_data;
          if (costData?.properties?.rows && Array.isArray(costData.properties.rows)) {
            hasData = true;
            costData.properties.rows.forEach((row: any[]) => {
              if (Array.isArray(row) && row.length > 0) {
                const cost = parseFloat(row[0]) || 0;
                totalCost += cost;
                if (row.length > 5 && row[5]) {
                  currency = row[5];
                }
              }
            });
          }
        }
      }

      // 保存查询记录到数据库
      const billingRecord = {
        fileName: path.basename(fileName),
        configName,
        filePath: credentialsPath,
        appId: credential.appId,
        tenantId: credential.tenant,
        displayName: credential.displayName,
        queryDate: new Date(),
        subscriptionId: Object.keys(summaryData)[0] || undefined, // 使用第一个订阅ID
        totalCost: totalCost > 0 ? totalCost : undefined,
        currency: totalCost > 0 ? currency : undefined,
        billingData: JSON.stringify(summaryData),
        queryStatus: hasData ? 'success' : 'no_subscription' as 'success' | 'failed' | 'no_subscription',
        errorMessage: hasData ? undefined : 'No billing data found',
        lastModified: new Date()
      };

      await this.saveJsonBillingRecord(billingRecord);
      logger.info(`Saved billing record for ${fileName}: ${totalCost} ${currency}`);

    } catch (error) {
      logger.error(`Failed to process Python script result: ${error}`);
      throw error;
    }
  }
}