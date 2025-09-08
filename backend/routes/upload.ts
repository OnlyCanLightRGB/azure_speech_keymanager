import express from 'express';
import multer from 'multer';
import { KeyManager } from '../services/KeyManager';
import { TranslationKeyManager } from '../services/TranslationKeyManager';
import { 
  ApiResponse, 
  KeyUploadRequest, 
  KeyUploadResponse,
  KeyUploadResult,
  BulkKeyOperationRequest,
  BulkKeyOperationResponse,
  BulkKeyOperationResult,
  ResourceKeyCreationRequest,
  ResourceKeyCreationResponse,
  ResourceKeyCreationResult,
  ResourceValidationRequest,
  ResourceValidationResponse,
  ResourceValidationResult,
  BillingMonitoringRequest,
  BillingMonitoringResponse,
  BillingKeyItem,
  AzureServicePrincipal,
  AzureResourceCreationRequest,
  AzureResourceCreationResponse
} from '../types';
import logger from '../utils/logger';
import { BillingService } from '../services/BillingService';
import { SchedulerService } from '../services/SchedulerService';
import { AzureResourceService } from '../services/AzureResourceService';

const router = express.Router();

// 配置multer用于文件上传
const storage = multer.memoryStorage();
const upload = multer({ 
  storage: storage,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB限制
  },
  fileFilter: (req, file, cb) => {
    if (file.mimetype === 'application/json' || file.originalname.endsWith('.json')) {
      cb(null, true);
    } else {
      cb(new Error('只允许上传JSON文件'));
    }
  }
});

export function createUploadRoutes(
  keyManager: KeyManager,
  translationKeyManager: TranslationKeyManager,
  billingService?: BillingService,
  schedulerService?: SchedulerService
) {

  /**
   * POST /api/upload/create-resources - 创建Azure资源或添加现有密钥
   */
  router.post('/create-resources', upload.single('file'), async (req, res) => {
    try {
      if (!req.file) {
        const response: ApiResponse = {
          success: false,
          error: '请上传JSON文件'
        };
        return res.status(400).json(response);
      }

      // 解析JSON文件
      let fileData: any;
      try {
        const fileContent = req.file.buffer.toString('utf8');
        fileData = JSON.parse(fileContent);
      } catch (parseError) {
        const response: ApiResponse = {
          success: false,
          error: 'JSON文件格式错误'
        };
        return res.status(400).json(response);
      }

      // 检测文件格式：Azure服务主体凭据 vs 资源创建请求
      const isAzureCredentials = fileData.appId && fileData.password && fileData.tenant;
      
      if (isAzureCredentials) {
        // 处理Azure服务主体凭据格式 - 创建新的Azure资源
        const azureService = new AzureResourceService();
        
        // 从请求参数获取资源类型和配置
        const resourceType = req.body.resourceType || 'speech'; // 默认为speech
        const resourceConfig = {
          subscriptionId: req.body.subscriptionId,
          resourceGroupName: req.body.resourceGroupName,
          resourceName: req.body.resourceName,
          location: req.body.location || 'East Asia',
          sku: req.body.sku || 'F0'
        };
        
        const azureRequest: AzureResourceCreationRequest = {
          credentials: fileData as AzureServicePrincipal,
          resourceType: resourceType as 'speech' | 'translation',
          resourceConfig: resourceConfig,
          options: {
            createResourceGroup: req.body.createResourceGroup !== false,
            enableAfterCreate: req.body.enableAfterCreate === true
          }
        };
        
        const azureResult = await azureService.createResource(azureRequest);
        
        if (azureResult.success && azureResult.data) {
          // 将创建的资源添加到密钥管理器
          try {
            const selectedKeyManager = resourceType === 'speech' ? keyManager : translationKeyManager;
            const createdKey = await selectedKeyManager.addKey(
              azureResult.data.keys.key1,
              azureResult.data.location,
              azureResult.data.resourceName
            );
            
            if (azureRequest.options?.enableAfterCreate) {
              await selectedKeyManager.enableKey(azureResult.data.keys.key1);
            }
            
            const response: AzureResourceCreationResponse = {
              success: true,
              data: azureResult.data,
              message: `Azure ${resourceType === 'speech' ? '语音' : '翻译'}服务资源创建成功并已添加到系统`
            };
            
            logger.info(`Azure resource created and added: ${azureResult.data.resourceName}`);
            return res.json(response);
          } catch (error: any) {
            logger.error('Failed to add created resource to key manager:', error);
            const response: AzureResourceCreationResponse = {
              success: false,
              message: '资源创建成功但添加到系统失败',
              error: error.message
            };
            return res.status(500).json(response);
          }
        } else {
          return res.status(400).json(azureResult);
        }
      } else {
        // 处理原有的资源创建请求格式
        const creationRequest = fileData as ResourceKeyCreationRequest;
        
        // 验证请求数据
        if (!creationRequest.type || !['speech', 'translation'].includes(creationRequest.type)) {
          const response: ApiResponse = {
            success: false,
            error: 'type必须是speech或translation'
          };
          return res.status(400).json(response);
        }

        if (!creationRequest.keys || !Array.isArray(creationRequest.keys) || creationRequest.keys.length === 0) {
          const response: ApiResponse = {
            success: false,
            error: 'keys数组不能为空'
          };
          return res.status(400).json(response);
        }

        const results: ResourceKeyCreationResult[] = [];
        const createdKeys: any[] = [];
        let successCount = 0;
        let failedCount = 0;

        // 批量创建资源key
        for (const keyItem of creationRequest.keys) {
          try {
            // 验证key项
            if (!keyItem.key || !keyItem.region) {
              results.push({
                key: keyItem.key || 'unknown',
                success: false,
                message: 'key和region是必需的',
                error: 'Missing required fields'
              });
              failedCount++;
              continue;
            }

            // 根据类型选择对应的key管理器
            if (creationRequest.type === 'speech') {
              const createdKey = await keyManager.addKey(
                keyItem.key, 
                keyItem.region, 
                keyItem.keyname || `SpeechKey-${Date.now()}`
              );
              
              // 如果设置了启用选项，则启用key
              if (creationRequest.options?.enableAfterCreate) {
                await keyManager.enableKey(keyItem.key);
              }

              results.push({
                key: keyItem.key,
                success: true,
                message: '语音资源key创建成功',
                resourceId: createdKey.id?.toString(),
                endpoint: `https://${keyItem.region}.api.cognitive.microsoft.com/`
              });
              
              createdKeys.push(createdKey);
              successCount++;
            } else if (creationRequest.type === 'translation') {
              const createdKey = await translationKeyManager.addKey(
                keyItem.key, 
                keyItem.region, 
                keyItem.keyname || `TranslationKey-${Date.now()}`
              );
              
              // 如果设置了启用选项，则启用key
              if (creationRequest.options?.enableAfterCreate) {
                await translationKeyManager.enableKey(keyItem.key);
              }

              results.push({
                key: keyItem.key,
                success: true,
                message: '翻译资源key创建成功',
                resourceId: createdKey.id?.toString(),
                endpoint: `https://${keyItem.region}.api.cognitive.microsoft.com/`
              });
              
              createdKeys.push(createdKey);
              successCount++;
            }

          } catch (error: any) {
            results.push({
              key: keyItem.key,
              success: false,
              message: '创建失败',
              error: error.message
            });
            failedCount++;
          }
        }

        const response: ResourceKeyCreationResponse = {
          success: true,
          data: {
            total: creationRequest.keys.length,
            success: successCount,
            failed: failedCount,
            results: results,
            createdKeys: createdKeys
          },
          message: `实时创建${creationRequest.type}资源完成: 成功${successCount}个, 失败${failedCount}个`
        };

        logger.info(`实时创建${creationRequest.type}资源: 成功${successCount}个, 失败${failedCount}个`);
        return res.json(response);
      }

    } catch (error: any) {
      logger.error('Error in POST /api/upload/create-resources:', error);
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
