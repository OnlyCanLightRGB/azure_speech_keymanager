import { Router, Request, Response } from 'express';
import { BillingService } from '../services/BillingService';
import { SchedulerService } from '../services/SchedulerService';
import logger from '../utils/logger';

export function createBillingRoutes(
  billingService: BillingService,
  schedulerService: SchedulerService
) {
  const router = Router();

  /**
   * 获取实时计费统计
   * GET /api/billing/stats/:subscriptionId
   */
  router.get('/stats/:subscriptionId', async (req: Request, res: Response) => {
    try {
      const { subscriptionId } = req.params;
      const stats = await billingService.getRealTimeBillingStats(subscriptionId);
      
      res.json({
        success: true,
        data: stats
      });
    } catch (error: any) {
      logger.error('Error getting billing stats:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });

  /**
   * 获取认知服务详细账单
   * GET /api/billing/cognitive-services/:subscriptionId
   */
  router.get('/cognitive-services/:subscriptionId', async (req: Request, res: Response) => {
    try {
      const { subscriptionId } = req.params;
      const resources = await billingService.getCognitiveServicesBilling(subscriptionId);
      
      res.json({
        success: true,
        data: resources
      });
    } catch (error: any) {
      logger.error('Error getting cognitive services billing:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });

  /**
   * 检查计费异常
   * GET /api/billing/anomalies/:subscriptionId
   */
  router.get('/anomalies/:subscriptionId', async (req: Request, res: Response) => {
    try {
      const { subscriptionId } = req.params;
      const { threshold = 100 } = req.query;
      
      const anomalies = await billingService.checkBillingAnomalies(
        subscriptionId, 
        Number(threshold)
      );
      
      res.json({
        success: true,
        data: anomalies
      });
    } catch (error: any) {
      logger.error('Error checking billing anomalies:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });

  /**
   * 生成计费报告
   * GET /api/billing/report/:subscriptionId
   */
  router.get('/report/:subscriptionId', async (req: Request, res: Response) => {
    try {
      const { subscriptionId } = req.params;
      const { format = 'json' } = req.query;
      
      const report = await billingService.generateBillingReport(
        subscriptionId, 
        format as 'json' | 'csv'
      );
      
      if (format === 'csv') {
        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', `attachment; filename="billing-report-${subscriptionId}-${new Date().toISOString().split('T')[0]}.csv"`);
        res.send(report);
      } else {
        res.json({
          success: true,
          data: report
        });
      }
    } catch (error: any) {
      logger.error('Error generating billing report:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });

  /**
   * 启动账单监控
   * POST /api/billing/monitoring/start
   */
  router.post('/monitoring/start', async (req: Request, res: Response) => {
    try {
      const { subscriptionId } = req.body;
      
      if (!subscriptionId) {
        return res.status(400).json({
          success: false,
          error: 'Subscription ID is required'
        });
      }

      const taskId = schedulerService.startBillingMonitoring(subscriptionId);
      
      return res.json({
        success: true,
        data: {
          taskId,
          message: 'Billing monitoring started successfully',
          interval: '10 minutes'
        }
      });
    } catch (error: any) {
      logger.error('Error starting billing monitoring:', error);
      return res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });

  /**
   * 停止账单监控
   * POST /api/billing/monitoring/stop/:taskId
   */
  router.post('/monitoring/stop/:taskId', async (req: Request, res: Response) => {
    try {
      const { taskId } = req.params;
      const success = schedulerService.stopTask(taskId);
      
      if (success) {
        res.json({
          success: true,
          message: 'Billing monitoring stopped successfully'
        });
      } else {
        res.status(404).json({
          success: false,
          error: 'Task not found'
        });
      }
    } catch (error: any) {
      logger.error('Error stopping billing monitoring:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });

  /**
   * 获取监控任务状态
   * GET /api/billing/monitoring/status
   */
  router.get('/monitoring/status', async (req: Request, res: Response) => {
    try {
      const tasks = schedulerService.getTasksStatus();
      const stats = schedulerService.getStats();
      
      res.json({
        success: true,
        data: {
          tasks,
          stats
        }
      });
    } catch (error: any) {
      logger.error('Error getting monitoring status:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });

  /**
   * 手动执行账单监控
   * POST /api/billing/monitoring/execute/:taskId
   */
  router.post('/monitoring/execute/:taskId', async (req: Request, res: Response) => {
    try {
      const { taskId } = req.params;
      const success = await schedulerService.executeTaskNow(taskId);
      
      if (success) {
        res.json({
          success: true,
          message: 'Billing monitoring executed successfully'
        });
      } else {
        res.status(404).json({
          success: false,
          error: 'Task not found or disabled'
        });
      }
    } catch (error: any) {
      logger.error('Error executing billing monitoring:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });

  /**
   * 获取账单使用详情
   * GET /api/billing/usage/:subscriptionId
   */
  router.get('/usage/:subscriptionId', async (req: Request, res: Response) => {
    try {
      const { subscriptionId } = req.params;
      const { startDate, endDate } = req.query;
      
      const usage = await billingService.getBillingUsage(
        subscriptionId,
        startDate as string,
        endDate as string
      );
      
      res.json({
        success: true,
        data: usage
      });
    } catch (error: any) {
      logger.error('Error getting billing usage:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });

  /**
   * 获取账户余额
   * GET /api/billing/balance/:subscriptionId
   */
  router.get('/balance/:subscriptionId', async (req: Request, res: Response) => {
    try {
      const { subscriptionId } = req.params;
      const balance = await billingService.getAccountBalance(subscriptionId);
      
      res.json({
        success: true,
        data: balance
      });
    } catch (error: any) {
      logger.error('Error getting account balance:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });

  /**
   * 获取使用情况统计
   * GET /api/billing/usage-statistics/:subscriptionId
   */
  router.get('/usage-statistics/:subscriptionId', async (req: Request, res: Response) => {
    try {
      const { subscriptionId } = req.params;
      
      const statistics = await billingService.getUsageStatistics(subscriptionId);
      
      res.json({
        success: true,
        data: statistics
      });
    } catch (error: any) {
      logger.error('Error getting usage statistics:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });

  /**
   * 获取计费概览
   * GET /api/billing/overview/:subscriptionId
   */
  router.get('/overview/:subscriptionId', async (req: Request, res: Response) => {
    try {
      const { subscriptionId } = req.params;
      
      // 并行获取多个计费信息
      const [stats, resources, anomalies, balance, usageStats] = await Promise.all([
        billingService.getRealTimeBillingStats(subscriptionId),
        billingService.getCognitiveServicesBilling(subscriptionId),
        billingService.checkBillingAnomalies(subscriptionId),
        billingService.getAccountBalance(subscriptionId).catch(() => null),
        billingService.getUsageStatistics(subscriptionId).catch(() => null)
      ]);
      
      const overview = {
        subscriptionId,
        summary: stats,
        resourceCount: resources.length,
        hasAnomalies: anomalies.hasAnomalies,
        anomalyCount: anomalies.anomalies.length,
        balance: balance,
        usageStatistics: usageStats,
        lastUpdated: new Date().toISOString()
      };
      
      res.json({
        success: true,
        data: overview
      });
    } catch (error: any) {
      logger.error('Error getting billing overview:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });

  return router;
}
