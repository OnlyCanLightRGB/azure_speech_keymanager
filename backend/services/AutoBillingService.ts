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
  lastQueryTime?: Date;
  nextQueryTime?: Date;
}

export interface BillingHistoryRecord {
  id?: number;
  subscriptionId: string;
  queryDate: Date;
  periodStart: Date;
  periodEnd: Date;
  totalCost: number;
  currency: string;
  speechCost: number;
  translationCost: number;
  otherCost: number;
  usageCount: number;
  resourceCount: number;
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
    // 每1分钟检查一次JSON配置并执行到期的查询（支持分钟级查询间隔）
    this.jsonQueryTaskId = this.schedulerService.addTask({
      name: 'JSON Config Billing Query',
      interval: 1 * 60 * 1000, // 1分钟
      enabled: true,
      task: async () => {
        await this.checkAndExecuteJsonConfigQueries();
      }
    });

    logger.info(`JSON config billing query scheduler started with task ID: ${this.jsonQueryTaskId}`);
  }

  /**
   * 检查并执行JSON配置的定期查询
   */
  private async checkAndExecuteJsonConfigQueries(): Promise<void> {
    try {
      // 获取需要执行查询的配置
      const pendingConfigs = await this.getPendingJsonConfigs();
      
      logger.info(`Found ${pendingConfigs.length} JSON configs ready for query`);

      for (const config of pendingConfigs) {
        try {
          // 创建调度记录
          const scheduleId = await this.createJsonSchedule(config.id!, new Date());
          
          // 更新调度状态为运行中
          await this.updateJsonScheduleStatus(scheduleId, 'running');
          
          // 执行查询
          await this.executeJsonConfigQuery(config);
          
          // 更新调度状态为完成
          await this.updateJsonScheduleStatus(scheduleId, 'completed', 'Query executed successfully');
          
          // 更新下次查询时间
          await this.updateJsonConfigQueryTime(config.id!, config.queryIntervalMinutes);
          
          logger.info(`Successfully executed query for config: ${config.configName}`);
        } catch (error) {
          logger.error(`Failed to execute query for config ${config.configName}:`, error);
          
          // 如果有调度记录，更新为失败状态
          try {
            const scheduleId = await this.createJsonSchedule(config.id!, new Date());
            await this.updateJsonScheduleStatus(scheduleId, 'failed', error instanceof Error ? error.message : 'Unknown error');
          } catch (scheduleError) {
            logger.error('Failed to update schedule status:', scheduleError);
          }
        }
      }
    } catch (error) {
      logger.error('Error in checkAndExecuteJsonConfigQueries:', error);
    }
  }

  /**
   * 手动触发JSON配置查询（公共方法）
   */
  async triggerJsonConfigQueries(): Promise<void> {
    await this.checkAndExecuteJsonConfigQueries();
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
      await this.queryBillingForCredential(credential, fileName, filePath, lastModified);

    } catch (error) {
      logger.error(`Error processing JSON file ${filePath}:`, error);
      const fileName = path.basename(filePath);
      await this.saveJsonBillingRecord({
        fileName,
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
    lastModified: Date
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
          file_name, file_path, app_id, tenant_id, display_name,
          query_date, subscription_id, total_cost, currency,
          billing_data, query_status, error_message, last_modified
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `;

      const values = [
        record.fileName,
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
        SELECT id, file_name as fileName, file_path as filePath,
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
      const query = `
        INSERT INTO json_billing_configs (
          config_name, file_name, file_path, app_id, tenant_id, display_name,
          password, auto_query_enabled, query_interval_minutes, status
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `;

      const values = [
        config.configName,
        config.fileName,
        config.filePath,
        config.appId,
        config.tenantId,
        config.displayName,
        config.password,
        config.autoQueryEnabled,
        config.queryIntervalMinutes,
        config.status
      ];

      const [result] = await connection.execute(query, values);
      const insertResult = result as any;
      return insertResult.insertId;

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
   * 执行JSON配置查询
   */
  async executeJsonConfigQuery(config: JsonBillingConfig): Promise<void> {
    logger.info(`Executing JSON config query for: ${config.configName}`);

    try {
      // 创建调度记录
      const scheduleId = await this.createJsonSchedule(config.id!, new Date());
      await this.updateJsonScheduleStatus(scheduleId, 'running');

      // 读取JSON文件
      const content = fs.readFileSync(config.filePath, 'utf8');
      const credential = JSON.parse(content) as JsonCredential;

      if (!this.isValidCredential(credential)) {
        throw new Error('Invalid credential format');
      }

      // 执行账单查询
      await this.queryBillingForCredential(credential, config.fileName, config.filePath, new Date());

      // 更新调度状态
      await this.updateJsonScheduleStatus(scheduleId, 'completed', 'Query completed successfully');
      
      // 更新下次查询时间
      await this.updateJsonConfigQueryTime(config.id!, config.queryIntervalMinutes);

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
      const nextQueryTime = new Date(Date.now() + intervalMinutes * 60 * 1000);
      
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
    // 每小时检查一次是否有需要查询的订阅
    this.scheduledTaskId = this.schedulerService.addTask({
      name: 'Auto Billing Query',
      interval: 60 * 60 * 1000, // 1小时
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
               query_interval_hours as queryIntervalHours, last_query_time as lastQueryTime,
               next_query_time as nextQueryTime
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
      // 获取账单数据
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
      throw error;
    }
  }

  /**
   * 保存账单历史记录
   */
  private async saveBillingHistory(record: BillingHistoryRecord): Promise<number> {
    const connection = await this.connection.getConnection();
    try {
      const query = `
        INSERT INTO billing_history (
          subscription_id, query_date, period_start, period_end, total_cost, currency,
          speech_cost, translation_cost, other_cost, usage_count, resource_count,
          raw_data, anomalies_detected, anomaly_details, query_status, error_message
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON DUPLICATE KEY UPDATE
          period_start = VALUES(period_start),
          period_end = VALUES(period_end),
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

      const [result] = await connection.execute(query, [
        record.subscriptionId,
        record.queryDate,
        record.periodStart,
        record.periodEnd,
        record.totalCost,
        record.currency,
        record.speechCost,
        record.translationCost,
        record.otherCost,
        record.usageCount,
        record.resourceCount,
        record.rawData,
        record.anomaliesDetected,
        record.anomalyDetails,
        record.queryStatus,
        record.errorMessage
      ]);

      return (result as any).insertId;
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
          resource.resourceId,
          resource.resourceName,
          resource.resourceType,
          resource.location,
          resource.totalCost,
          resource.currency,
          JSON.stringify(resource.usageBreakdown)
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
    if (record.totalCost > costThreshold) {
      alerts.push({
        subscriptionId: subscription.subscriptionId,
        alertType: 'cost_threshold',
        severity: record.totalCost > costThreshold * 2 ? 'critical' : 'high',
        title: '账单成本超出阈值',
        message: `订阅 ${subscription.subscriptionId} 的账单成本 ${record.totalCost} ${record.currency} 超出了设定的阈值 ${costThreshold}`,
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
      const nextQueryTime = new Date(Date.now() + subscription.queryIntervalHours * 60 * 60 * 1000);
      
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

      query += ' ORDER BY query_date DESC LIMIT ?';
      params.push(limit);

      const [rows] = await connection.execute(query, params);
      return rows as BillingHistoryRecord[];
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
    const subscription = await this.getSubscriptionById(subscriptionId);
    if (!subscription) {
      throw new Error(`Subscription not found: ${subscriptionId}`);
    }

    await this.executeSubscriptionQuery(subscription);
    await this.updateNextQueryTime(subscription);
  }

  private async getSubscriptionById(subscriptionId: string): Promise<BillingSubscription | null> {
    const connection = await this.connection.getConnection();
    try {
      const query = `
        SELECT id, subscription_id as subscriptionId, subscription_name as subscriptionName,
               tenant_id as tenantId, status, auto_query_enabled as autoQueryEnabled,
               query_interval_hours as queryIntervalHours, last_query_time as lastQueryTime,
               next_query_time as nextQueryTime
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
}