import { Router, Request, Response } from 'express';
import { AzureCLIService } from '../services/AzureCLIService';
import { EnhancedConfigService } from '../services/EnhancedConfigService';
import logger from '../utils/logger';
import { ApiResponse } from '../types';

export function createAzureCLIRoutes(
  azureCLIService: AzureCLIService,
  enhancedConfigService: EnhancedConfigService
) {
  const router = Router();

  /**
   * GET /api/azure-cli/health - 检查Azure CLI连接状态
   */
  router.get('/health', async (req: Request, res: Response) => {
    try {
      const config = enhancedConfigService.getConfig();
      
      if (!config.azureCLI.appId || !config.azureCLI.password || !config.azureCLI.tenant) {
        const response: ApiResponse = {
          success: false,
          error: 'Azure CLI credentials not configured'
        };
        return res.status(400).json(response);
      }

      // 测试获取订阅列表
      const subscriptions = await azureCLIService.getSubscriptions();
      
      const response: ApiResponse = {
        success: true,
        data: {
          connected: true,
          subscriptionCount: subscriptions.length,
          subscriptions: subscriptions.map(sub => ({
            id: sub.subscriptionId,
            name: sub.displayName,
            state: sub.state
          }))
        },
        message: 'Azure CLI connection successful'
      };
      
      return res.json(response);
    } catch (error: any) {
      logger.error('Azure CLI health check failed:', error);
      const response: ApiResponse = {
        success: false,
        error: `Azure CLI connection failed: ${error.message}`,
        data: { connected: false }
      };
      return res.status(500).json(response);
    }
  });

  /**
   * GET /api/azure-cli/subscriptions - 获取Azure订阅列表
   */
  router.get('/subscriptions', async (req: Request, res: Response) => {
    try {
      const subscriptions = await azureCLIService.getSubscriptions();
      
      const response: ApiResponse = {
        success: true,
        data: subscriptions,
        message: 'Subscriptions retrieved successfully'
      };
      
      return res.json(response);
    } catch (error: any) {
      logger.error('Failed to get subscriptions:', error);
      const response: ApiResponse = {
        success: false,
        error: error.message
      };
      return res.status(500).json(response);
    }
  });

  /**
   * GET /api/azure-cli/cognitive-services - 获取认知服务列表
   */
  router.get('/cognitive-services', async (req: Request, res: Response) => {
    try {
      const { subscriptionId } = req.query;
      
      if (!subscriptionId || typeof subscriptionId !== 'string') {
        const response: ApiResponse = {
          success: false,
          error: 'Subscription ID is required'
        };
        return res.status(400).json(response);
      }

      const services = await azureCLIService.getCognitiveServices(subscriptionId);
      
      const response: ApiResponse = {
        success: true,
        data: services,
        message: 'Cognitive services retrieved successfully'
      };
      
      return res.json(response);
    } catch (error: any) {
      logger.error('Failed to get cognitive services:', error);
      const response: ApiResponse = {
        success: false,
        error: error.message
      };
      return res.status(500).json(response);
    }
  });

  /**
   * POST /api/azure-cli/auto-discover - 执行自动发现
   */
  router.post('/auto-discover', async (req: Request, res: Response) => {
    try {
      const discoveredKeys = await enhancedConfigService.performAutoDiscovery();
      
      const response: ApiResponse = {
        success: true,
        data: {
          discoveredKeys,
          discoveryTime: new Date().toISOString(),
          summary: {
            speechKeys: discoveredKeys.speech.length,
            translationKeys: discoveredKeys.translation.length,
            totalKeys: discoveredKeys.speech.length + discoveredKeys.translation.length
          }
        },
        message: 'Auto-discovery completed successfully'
      };
      
      return res.json(response);
    } catch (error: any) {
      logger.error('Auto-discovery failed:', error);
      const response: ApiResponse = {
        success: false,
        error: error.message
      };
      return res.status(500).json(response);
    }
  });

  /**
   * GET /api/azure-cli/quota/:subscriptionId/:resourceId - 获取配额使用情况
   */
  router.get('/quota/:subscriptionId/:resourceId', async (req: Request, res: Response) => {
    try {
      const { subscriptionId, resourceId } = req.params;
      
      const quotaInfo = await enhancedConfigService.checkQuotaUsage(subscriptionId, resourceId);
      
      const response: ApiResponse = {
        success: true,
        data: {
          ...quotaInfo,
          checkedAt: new Date().toISOString()
        },
        message: 'Quota information retrieved successfully'
      };
      
      return res.json(response);
    } catch (error: any) {
      logger.error('Failed to get quota information:', error);
      const response: ApiResponse = {
        success: false,
        error: error.message
      };
      return res.status(500).json(response);
    }
  });

  /**
   * GET /api/azure-cli/service-health/:subscriptionId/:resourceId - 检查服务健康状态
   */
  router.get('/service-health/:subscriptionId/:resourceId', async (req: Request, res: Response) => {
    try {
      const { subscriptionId, resourceId } = req.params;
      
      const healthInfo = await azureCLIService.checkServiceHealth(subscriptionId, resourceId);
      
      const response: ApiResponse = {
        success: true,
        data: {
          ...healthInfo,
          checkedAt: new Date().toISOString()
        },
        message: 'Service health check completed'
      };
      
      return res.json(response);
    } catch (error: any) {
      logger.error('Service health check failed:', error);
      const response: ApiResponse = {
        success: false,
        error: error.message
      };
      return res.status(500).json(response);
    }
  });

  /**
   * GET /api/azure-cli/endpoints - 获取端点配置
   */
  router.get('/endpoints', async (req: Request, res: Response) => {
    try {
      const config = enhancedConfigService.getConfig();
      
      const response: ApiResponse = {
        success: true,
        data: config.endpoints,
        message: 'Endpoint configuration retrieved successfully'
      };
      
      return res.json(response);
    } catch (error: any) {
      logger.error('Failed to get endpoint configuration:', error);
      const response: ApiResponse = {
        success: false,
        error: error.message
      };
      return res.status(500).json(response);
    }
  });

  /**
   * PUT /api/azure-cli/endpoints/:type/:name - 更新端点配置
   */
  router.put('/endpoints/:type/:name', async (req: Request, res: Response) => {
    try {
      const { type, name } = req.params;
      const updates = req.body;
      
      if (type !== 'speech' && type !== 'translation') {
        const response: ApiResponse = {
          success: false,
          error: 'Invalid endpoint type. Must be "speech" or "translation"'
        };
        return res.status(400).json(response);
      }
      
      const success = enhancedConfigService.updateEndpointConfig(type as 'speech' | 'translation', name, updates);
      
      if (!success) {
        const response: ApiResponse = {
          success: false,
          error: 'Endpoint not found'
        };
        return res.status(404).json(response);
      }
      
      const response: ApiResponse = {
        success: true,
        message: 'Endpoint configuration updated successfully'
      };
      
      return res.json(response);
    } catch (error: any) {
      logger.error('Failed to update endpoint configuration:', error);
      const response: ApiResponse = {
        success: false,
        error: error.message
      };
      return res.status(500).json(response);
    }
  });

  /**
   * POST /api/azure-cli/endpoints/:type - 添加新端点
   */
  router.post('/endpoints/:type', async (req: Request, res: Response) => {
    try {
      const { type } = req.params;
      const endpoint = req.body;
      
      if (type !== 'speech' && type !== 'translation') {
        const response: ApiResponse = {
          success: false,
          error: 'Invalid endpoint type. Must be "speech" or "translation"'
        };
        return res.status(400).json(response);
      }
      
      enhancedConfigService.addEndpoint(type as 'speech' | 'translation', endpoint);
      
      const response: ApiResponse = {
        success: true,
        message: 'Endpoint added successfully'
      };
      
      return res.json(response);
    } catch (error: any) {
      logger.error('Failed to add endpoint:', error);
      const response: ApiResponse = {
        success: false,
        error: error.message
      };
      return res.status(500).json(response);
    }
  });

  return router;
}
