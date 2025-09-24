import { BillingService } from './BillingService';
import { SchedulerService } from './SchedulerService';
// 导入飞书通知服务接口
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
    // 每6小时检查一次JSON文件并查询账单
    this.jsonQueryTaskId = this.schedulerService.addTask({
      name: 'JSON Billing Query',
      interval: 6 * 60 * 60 * 1000, // 6小时
      enabled: true,
      task: async () => {
        await this.checkAndQueryJsonFiles();
      }
    });

    logger.info(`JSON billing query scheduler started with task ID: ${this.jsonQueryTaskId}`);
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
      // 这里需要使用凭据来获取订阅信息
      // 由于我们需要先通过Azure CLI或API获取订阅列表，这里先记录基本信息
      const record: JsonBillingRecord = {
        fileName,
        filePath,
        appId: credential.appId,
        tenantId: credential.tenant,
        displayName: credential.displayName,
        queryDate: new Date(),
        queryStatus: 'no_subscription',
        errorMessage: 'Subscription discovery not implemented yet',
        lastModified
      };

      // TODO: 实现通过凭据获取订阅列表和账单信息的逻辑
      // 这需要集成Azure CLI或Azure REST API

      await this.saveJsonBillingRecord(record);
      logger.info(`Recorded JSON billing query for ${fileName}`);

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
        message: `订阅 ${subscription.subscriptionName} 的账单成本 ${record.totalCost} ${record.currency} 超出阈值 ${costThreshold}`,
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
        title: '检测到账单异常',
        message: `订阅 ${subscription.subscriptionName} 检测到 ${anomalies.anomalies.length} 个账单异常`,
        actualValue: anomalies.anomalies.length
      });
    }

    // 保存告警并发送通知
    for (const alert of alerts) {
      await this.saveAlert(alert);
      await this.sendAlertNotification(alert);
    }
  }

  /**
   * 保存告警记录
   */
  private async saveAlert(alert: BillingAlert): Promise<void> {
    const connection = await this.connection.getConnection();
    try {
      const query = `
        INSERT INTO billing_alerts (
          subscription_id, alert_type, severity, title, message,
          threshold_value, actual_value, resource_id
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `;

      await connection.execute(query, [
        alert.subscriptionId,
        alert.alertType,
        alert.severity,
        alert.title,
        alert.message,
        alert.thresholdValue,
        alert.actualValue,
        alert.resourceId
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
        // 使用自定义消息发送通知
        const message = {
          msg_type: 'text',
          content: {
            text: `🚨 **账单告警**\n\n**类型**: ${alert.alertType}\n**严重程度**: ${alert.severity}\n**标题**: ${alert.title}\n**详情**: ${alert.message}\n\n时间: ${new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })}`
          }
        };
        
        // 使用飞书通知服务发送消息
        await this.feishuService.sendNotification(
          '账单异常警报',
          JSON.stringify(message.content.text, null, 2)
        );
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
        SET last_query_time = NOW(), next_query_time = ?
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
    const failureRecord: BillingHistoryRecord = {
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

    await this.saveBillingHistory(failureRecord);

    // 创建查询失败告警
    const alert: BillingAlert = {
      subscriptionId: subscription.subscriptionId,
      alertType: 'query_failure',
      severity: 'high',
      title: '账单查询失败',
      message: `订阅 ${subscription.subscriptionName} 的账单查询失败: ${error.message}`
    };

    await this.saveAlert(alert);
    await this.sendAlertNotification(alert);
  }

  /**
   * 获取配置值
   */
  private async getConfigValue(key: string, defaultValue: number): Promise<number> {
    const connection = await this.connection.getConnection();
    try {
      const query = 'SELECT config_value FROM system_config WHERE config_key = ?';
      const [rows] = await connection.execute(query, [key]);
      
      if (Array.isArray(rows) && rows.length > 0) {
        return parseFloat((rows[0] as any).config_value) || defaultValue;
      }
      
      return defaultValue;
    } catch (error) {
      logger.error(`Failed to get config value for ${key}:`, error);
      return defaultValue;
    } finally {
      connection.release();
    }
  }

  /**
   * 添加订阅
   */
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
          subscription_id, subscription_name, tenant_id, 
          auto_query_enabled, query_interval_hours, next_query_time
        ) VALUES (?, ?, ?, ?, ?, ?)
        ON DUPLICATE KEY UPDATE
          subscription_name = VALUES(subscription_name),
          tenant_id = VALUES(tenant_id),
          auto_query_enabled = VALUES(auto_query_enabled),
          query_interval_hours = VALUES(query_interval_hours),
          updated_at = CURRENT_TIMESTAMP
      `;

      const intervalHours = options.queryIntervalHours || 24;
      const nextQueryTime = new Date(Date.now() + intervalHours * 60 * 60 * 1000);

      await connection.execute(query, [
        subscriptionId,
        subscriptionName,
        options.tenantId,
        options.autoQueryEnabled !== false,
        intervalHours,
        nextQueryTime
      ]);

      logger.info(`Added billing subscription: ${subscriptionId}`);
    } finally {
      connection.release();
    }
  }

  /**
   * 获取订阅列表
   */
  async getSubscriptions(): Promise<BillingSubscription[]> {
    const connection = await this.connection.getConnection();
    try {
      const query = `
        SELECT id, subscription_id as subscriptionId, subscription_name as subscriptionName,
               tenant_id as tenantId, status, auto_query_enabled as autoQueryEnabled,
               query_interval_hours as queryIntervalHours, last_query_time as lastQueryTime,
               next_query_time as nextQueryTime, created_at as createdAt, updated_at as updatedAt
        FROM billing_subscriptions
        ORDER BY created_at DESC
      `;

      const [rows] = await connection.execute(query);
      return rows as BillingSubscription[];
    } finally {
      connection.release();
    }
  }

  /**
   * 获取账单历史
   */
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
               anomalies_detected as anomaliesDetected, anomaly_details as anomalyDetails,
               query_status as queryStatus, error_message as errorMessage,
               created_at as createdAt, updated_at as updatedAt
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

      query += ` ORDER BY query_date DESC LIMIT ${limit}`;

      const [rows] = await connection.execute(query, params);
      return rows as BillingHistoryRecord[];
    } finally {
      connection.release();
    }
  }

  /**
   * 获取告警列表
   */
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
               is_resolved as isResolved, resolved_at as resolvedAt,
               resolved_by as resolvedBy, notification_sent as notificationSent,
               notification_sent_at as notificationSentAt,
               created_at as createdAt, updated_at as updatedAt
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
        params.push(isResolved);
      }

      query += ` ORDER BY created_at DESC LIMIT ${limit}`;

      const [rows] = await connection.execute(query, params);
      return rows as any[];
    } finally {
      connection.release();
    }
  }

  /**
   * 手动触发查询
   */
  async triggerManualQuery(subscriptionId: string): Promise<void> {
    const subscription = await this.getSubscriptionById(subscriptionId);
    if (!subscription) {
      throw new Error(`Subscription not found: ${subscriptionId}`);
    }

    await this.executeSubscriptionQuery(subscription);
    await this.updateNextQueryTime(subscription);
  }

  /**
   * 根据ID获取订阅
   */
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
      const subscriptions = rows as BillingSubscription[];
      return subscriptions.length > 0 ? subscriptions[0] : null;
    } finally {
      connection.release();
    }
  }

  /**
   * 停止服务
   */
  async stop(): Promise<void> {
    if (this.scheduledTaskId) {
      this.schedulerService.stopTask(this.scheduledTaskId);
      this.scheduledTaskId = undefined;
    }
    this.isInitialized = false;
    logger.info('AutoBillingService stopped');
  }

  /**
   * 获取服务状态
   */
  async getStatus(): Promise<{
    isRunning: boolean;
    nextScheduledRun?: string;
    lastRun?: string;
    totalSubscriptions: number;
    activeSubscriptions: number;
  }> {
    // 获取订阅统计信息
    const subscriptions = await this.getSubscriptions();
    const activeSubscriptions = subscriptions.filter(s => s.status === 'active' && s.autoQueryEnabled);
    
    const connection = await this.connection.getConnection();
    try {
      // 获取最后运行时间
      const lastRunQuery = `
        SELECT MAX(created_at) as lastRun 
        FROM billing_history 
        ORDER BY created_at DESC 
        LIMIT 1
      `;
      const [lastRunRows] = await connection.execute(lastRunQuery);
      const lastRun = (lastRunRows as any[])[0]?.lastRun;
      
      // 获取下次运行时间
      const nextRunQuery = `
        SELECT MIN(next_query_time) as nextRun 
        FROM billing_subscriptions 
        WHERE status = 'active' AND auto_query_enabled = 1 AND next_query_time > NOW()
      `;
      const [nextRunRows] = await connection.execute(nextRunQuery);
      const nextRun = (nextRunRows as any[])[0]?.nextRun;

      return {
        isRunning: this.isInitialized && !!this.scheduledTaskId,
        nextScheduledRun: nextRun ? nextRun.toISOString() : undefined,
        lastRun: lastRun ? lastRun.toISOString() : undefined,
        totalSubscriptions: subscriptions.length,
        activeSubscriptions: activeSubscriptions.length
      };
    } finally {
      connection.release();
    }
  }
}