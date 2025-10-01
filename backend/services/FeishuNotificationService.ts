import logger from '../utils/logger';

export interface FeishuNotificationConfig {
  webhookUrl?: string;
  enabled?: boolean;
}

export class FeishuNotificationService {
  private config: FeishuNotificationConfig;

  constructor(config: FeishuNotificationConfig = {}) {
    this.config = {
      enabled: false,
      ...config
    };
  }

  /**
   * Send notification to Feishu
   */
  async sendNotification(title: string, content: string): Promise<boolean> {
    if (!this.config.enabled || !this.config.webhookUrl) {
      logger.debug('Feishu notification disabled or webhook URL not configured');
      return false;
    }

    try {
      // 确保中文内容正确编码
      const textContent = `${title}\n${content}`;

      const payload = {
        msg_type: 'text',
        content: {
          text: textContent
        }
      };

      // 使用 Buffer 确保 UTF-8 编码
      const jsonString = JSON.stringify(payload, null, 0);
      const bodyBuffer = Buffer.from(jsonString, 'utf8');

      const response = await fetch(this.config.webhookUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json; charset=utf-8',
          'Accept': 'application/json',
          'User-Agent': 'Azure-Speech-KeyManager/1.0',
          'Content-Length': bodyBuffer.length.toString()
        },
        body: bodyBuffer
      });

      if (response.ok) {
        logger.info('Feishu notification sent successfully');
        return true;
      } else {
        logger.error(`Failed to send Feishu notification: ${response.status} ${response.statusText}`);
        return false;
      }
    } catch (error) {
      logger.error('Error sending Feishu notification:', error);
      return false;
    }
  }

  /**
   * Send billing alert notification
   */
  async sendBillingAlert(message: string): Promise<boolean> {
    return this.sendNotification('Azure 计费告警', message);
  }

  /**
   * Send system alert notification
   */
  async sendSystemAlert(message: string): Promise<boolean> {
    return this.sendNotification('系统告警', message);
  }

  /**
   * Send 401 key error notification
   */
  async send401KeyAlert(keyId: string, keyName?: string, service?: string): Promise<boolean> {
    const serviceName = service || 'Azure服务';
    const displayName = keyName || keyId;
    const message = `🔑 密钥认证失败 (401错误)\n\n` +
                   `服务: ${serviceName}\n` +
                   `密钥ID: ${keyId}\n` +
                   `密钥名称: ${displayName}\n` +
                   `时间: ${new Date().toLocaleString('zh-CN')}\n\n` +
                   `请检查密钥是否已过期或被禁用，并及时更新密钥配置。`;
    
    return this.sendNotification('🚨 Azure密钥认证失败告警', message);
  }

  /**
   * Update configuration
   */
  updateConfig(config: Partial<FeishuNotificationConfig>): void {
    this.config = { ...this.config, ...config };
  }

  /**
   * Check if service is enabled
   */
  isEnabled(): boolean {
    return this.config.enabled === true && !!this.config.webhookUrl;
  }
}

export default FeishuNotificationService;