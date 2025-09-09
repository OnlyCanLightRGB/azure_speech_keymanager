import logger from '../utils/logger';
import { MigrationAlert } from './AutoMigrationService';
import * as fs from 'fs';
import * as path from 'path';

export interface AlertConfig {
  // 邮件配置
  email?: {
    enabled: boolean;
    smtp?: {
      host: string;
      port: number;
      secure: boolean;
      auth: {
        user: string;
        pass: string;
      };
    };
    recipients: string[];
  };
  
  // Webhook配置
  webhook?: {
    enabled: boolean;
    url: string;
    headers?: Record<string, string>;
  };
  
  // 日志文件配置
  logFile?: {
    enabled: boolean;
    path: string;
  };
  
  // 控制台输出配置
  console?: {
    enabled: boolean;
    colors: boolean;
  };
}

/**
 * 迁移报警服务 - 处理各种类型的迁移通知
 */
export class MigrationAlertService {
  private config: AlertConfig;
  private alertHistory: MigrationAlert[] = [];
  private maxHistorySize = 100;

  constructor(config?: AlertConfig) {
    this.config = {
      console: { enabled: true, colors: true },
      logFile: { 
        enabled: true, 
        path: path.join(__dirname, '../../logs/migration-alerts.log') 
      },
      ...config
    };
    
    // 确保日志目录存在
    if (this.config.logFile?.enabled) {
      const logDir = path.dirname(this.config.logFile.path);
      if (!fs.existsSync(logDir)) {
        fs.mkdirSync(logDir, { recursive: true });
      }
    }
  }

  /**
   * 处理迁移报警
   */
  public async handleAlert(alert: MigrationAlert): Promise<void> {
    // 添加到历史记录
    this.alertHistory.push(alert);
    if (this.alertHistory.length > this.maxHistorySize) {
      this.alertHistory.shift();
    }

    // 并行处理各种通知方式
    const promises: Promise<void>[] = [];

    if (this.config.console?.enabled) {
      promises.push(this.sendConsoleAlert(alert));
    }

    if (this.config.logFile?.enabled) {
      promises.push(this.sendLogFileAlert(alert));
    }

    if (this.config.email?.enabled) {
      promises.push(this.sendEmailAlert(alert));
    }

    if (this.config.webhook?.enabled) {
      promises.push(this.sendWebhookAlert(alert));
    }

    // 等待所有通知完成，但不因单个失败而中断
    await Promise.allSettled(promises);
  }

  /**
   * 控制台输出报警
   */
  private async sendConsoleAlert(alert: MigrationAlert): Promise<void> {
    try {
      const colors = this.config.console?.colors;
      const timestamp = alert.timestamp.toISOString();
      
      let message = `[${timestamp}] [${alert.type.toUpperCase()}] ${alert.message}`;
      
      if (colors) {
        switch (alert.type) {
          case 'success':
            message = `\x1b[32m${message}\x1b[0m`; // 绿色
            break;
          case 'warning':
            message = `\x1b[33m${message}\x1b[0m`; // 黄色
            break;
          case 'error':
            message = `\x1b[31m${message}\x1b[0m`; // 红色
            break;
        }
      }
      
      console.log(message);
      
      if (alert.details) {
        console.log('Details:', JSON.stringify(alert.details, null, 2));
      }
    } catch (error: any) {
      logger.error('Failed to send console alert:', error);
    }
  }

  /**
   * 日志文件报警
   */
  private async sendLogFileAlert(alert: MigrationAlert): Promise<void> {
    try {
      if (!this.config.logFile?.path) return;
      
      const logEntry = {
        timestamp: alert.timestamp.toISOString(),
        type: alert.type,
        message: alert.message,
        details: alert.details
      };
      
      const logLine = JSON.stringify(logEntry) + '\n';
      
      fs.appendFileSync(this.config.logFile.path, logLine);
    } catch (error: any) {
      logger.error('Failed to write alert to log file:', error);
    }
  }

  /**
   * 邮件报警
   */
  private async sendEmailAlert(alert: MigrationAlert): Promise<void> {
    try {
      if (!this.config.email?.smtp || !this.config.email?.recipients?.length) {
        return;
      }

      // 这里可以集成nodemailer或其他邮件服务
      // 为了简化，这里只记录日志
      logger.info(`Email alert would be sent to: ${this.config.email.recipients.join(', ')}`);
      logger.info(`Subject: Migration Alert - ${alert.type}`);
      logger.info(`Message: ${alert.message}`);
      
      // TODO: 实际的邮件发送实现
      // const nodemailer = require('nodemailer');
      // const transporter = nodemailer.createTransporter(this.config.email.smtp);
      // await transporter.sendMail({...});
      
    } catch (error: any) {
      logger.error('Failed to send email alert:', error);
    }
  }

  /**
   * Webhook报警
   */
  private async sendWebhookAlert(alert: MigrationAlert): Promise<void> {
    try {
      if (!this.config.webhook?.url) return;
      
      const payload = {
        timestamp: alert.timestamp.toISOString(),
        type: alert.type,
        message: alert.message,
        details: alert.details,
        service: 'azure-speech-keymanager',
        component: 'migration'
      };
      
      // 使用fetch发送webhook（Node.js 18+支持）
      const response = await fetch(this.config.webhook.url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...this.config.webhook.headers
        },
        body: JSON.stringify(payload)
      });
      
      if (!response.ok) {
        throw new Error(`Webhook request failed: ${response.status} ${response.statusText}`);
      }
      
      logger.info(`Webhook alert sent successfully to ${this.config.webhook.url}`);
    } catch (error: any) {
      logger.error('Failed to send webhook alert:', error);
    }
  }

  /**
   * 获取报警历史
   */
  public getAlertHistory(limit?: number): MigrationAlert[] {
    if (limit) {
      return this.alertHistory.slice(-limit);
    }
    return [...this.alertHistory];
  }

  /**
   * 清除报警历史
   */
  public clearAlertHistory(): void {
    this.alertHistory = [];
  }

  /**
   * 获取报警统计
   */
  public getAlertStats(): { success: number; warning: number; error: number; total: number } {
    const stats = {
      success: 0,
      warning: 0,
      error: 0,
      total: this.alertHistory.length
    };
    
    for (const alert of this.alertHistory) {
      stats[alert.type]++;
    }
    
    return stats;
  }

  /**
   * 测试报警系统
   */
  public async testAlerts(): Promise<void> {
    const testAlert: MigrationAlert = {
      type: 'success',
      message: '报警系统测试消息',
      timestamp: new Date(),
      details: {
        test: true,
        config: this.config
      }
    };
    
    await this.handleAlert(testAlert);
    logger.info('Alert system test completed');
  }
}