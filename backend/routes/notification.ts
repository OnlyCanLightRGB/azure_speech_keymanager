import express from 'express';
import mysql from 'mysql2/promise';
import { ApiResponse } from '../types';
import logger from '../utils/logger';
import { FeishuNotificationService } from '../services/FeishuNotificationService';

const router = express.Router();

export function createNotificationRoutes(db: mysql.Pool) {
  
  /**
   * GET /api/notification/feishu/status - Get Feishu notification status
   */
  router.get('/feishu/status', async (req, res) => {
    try {
      // Get Feishu configuration from database
      const [rows] = await db.execute<mysql.RowDataPacket[]>(
        'SELECT config_key, config_value FROM system_config WHERE config_key IN (?, ?)',
        ['feishu_notification_enabled', 'feishu_webhook_url']
      );
      
      const config: { [key: string]: string } = {};
      rows.forEach(row => {
        config[row.config_key] = row.config_value;
      });
      
      const enabled = config.feishu_notification_enabled === 'true';
      const webhookUrl = config.feishu_webhook_url || '';
      
      const response: ApiResponse = {
        success: true,
        data: {
          enabled,
          webhookConfigured: !!webhookUrl,
          webhookUrl: webhookUrl ? '***configured***' : ''
        },
        message: 'Feishu notification status retrieved successfully'
      };
      
      res.json(response);
    } catch (error: any) {
      logger.error('Error getting Feishu notification status:', error);
      const response: ApiResponse = {
        success: false,
        error: error.message
      };
      res.status(500).json(response);
    }
  });

  /**
   * POST /api/notification/feishu/test - Send test Feishu notification
   */
  router.post('/feishu/test', async (req, res) => {
    try {
      // Get Feishu configuration from database
      const [rows] = await db.execute<mysql.RowDataPacket[]>(
        'SELECT config_key, config_value FROM system_config WHERE config_key IN (?, ?)',
        ['feishu_notification_enabled', 'feishu_webhook_url']
      );
      
      const config: { [key: string]: string } = {};
      rows.forEach(row => {
        config[row.config_key] = row.config_value;
      });
      
      const enabled = config.feishu_notification_enabled === 'true';
      const webhookUrl = config.feishu_webhook_url || '';
      
      if (!enabled) {
        const response: ApiResponse = {
          success: false,
          error: 'Feishu notification is disabled'
        };
        return res.status(400).json(response);
      }
      
      if (!webhookUrl) {
        const response: ApiResponse = {
          success: false,
          error: 'Feishu webhook URL is not configured'
        };
        return res.status(400).json(response);
      }
      
      // Create Feishu notification service and send test message
      const feishuService = new FeishuNotificationService({
        enabled: true,
        webhookUrl
      });
      
      const testTitle = '🧪 测试通知';
      const testMessage = `这是一条来自Azure Speech Key Manager的测试通知。\n\n时间: ${new Date().toLocaleString('zh-CN')}`;
      
      const success = await feishuService.sendNotification(testTitle, testMessage);
      
      if (success) {
        const response: ApiResponse = {
          success: true,
          data: {
            message: 'Test notification sent successfully'
          },
          message: 'Feishu test notification sent successfully'
        };
        return res.json(response);
      } else {
        const response: ApiResponse = {
          success: false,
          error: 'Failed to send test notification'
        };
        return res.status(500).json(response);
      }
      
    } catch (error: any) {
      logger.error('Error sending Feishu test notification:', error);
      const response: ApiResponse = {
        success: false,
        error: error.message
      };
      return res.status(500).json(response);
    }
  });

  /**
   * POST /api/notification/feishu/send - Send custom Feishu notification
   */
  router.post('/feishu/send', async (req, res) => {
    try {
      const { title, content } = req.body;
      
      if (!title || !content) {
        const response: ApiResponse = {
          success: false,
          error: 'Title and content are required'
        };
        return res.status(400).json(response);
      }
      
      // Get Feishu configuration from database
      const [rows] = await db.execute<mysql.RowDataPacket[]>(
        'SELECT config_key, config_value FROM system_config WHERE config_key IN (?, ?)',
        ['feishu_notification_enabled', 'feishu_webhook_url']
      );
      
      const config: { [key: string]: string } = {};
      rows.forEach(row => {
        config[row.config_key] = row.config_value;
      });
      
      const enabled = config.feishu_notification_enabled === 'true';
      const webhookUrl = config.feishu_webhook_url || '';
      
      if (!enabled) {
        const response: ApiResponse = {
          success: false,
          error: 'Feishu notification is disabled'
        };
        return res.status(400).json(response);
      }
      
      if (!webhookUrl) {
        const response: ApiResponse = {
          success: false,
          error: 'Feishu webhook URL is not configured'
        };
        return res.status(400).json(response);
      }
      
      // Create Feishu notification service and send message
      const feishuService = new FeishuNotificationService({
        enabled: true,
        webhookUrl
      });
      
      const success = await feishuService.sendNotification(title, content);
      
      if (success) {
        const response: ApiResponse = {
          success: true,
          data: {
            message: 'Notification sent successfully'
          },
          message: 'Feishu notification sent successfully'
        };
        return res.json(response);
      } else {
        const response: ApiResponse = {
          success: false,
          error: 'Failed to send notification'
        };
        return res.status(500).json(response);
      }
      
    } catch (error: any) {
      logger.error('Error sending Feishu notification:', error);
      const response: ApiResponse = {
        success: false,
        error: error.message
      };
      return res.status(500).json(response);
    }
  });

  return router;
}

export default router;
