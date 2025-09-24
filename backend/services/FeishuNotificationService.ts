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
      const payload = {
        msg_type: 'text',
        content: {
          text: `${title}\n${content}`
        }
      };

      const response = await fetch(this.config.webhookUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload)
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