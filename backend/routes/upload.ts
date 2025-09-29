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
  BillingMonitoringRequest,
  BillingMonitoringResponse,
  BillingKeyItem,
  AzureServicePrincipal,
  AzureResourceCreationRequest,
  AzureResourceCreationResponse,
  AzureKey,
  TranslationKey
} from '../types';
import logger from '../utils/logger';
import { BillingService } from '../services/BillingService';
import { SchedulerService } from '../services/SchedulerService';
import { AzureResourceService } from '../services/AzureResourceService';
import { AzureCLIService } from '../services/AzureCLIService';
import { spawn } from 'child_process';
import * as path from 'path';

const router = express.Router();

// Multer配置
const storage = multer.memoryStorage();
const upload = multer({
  storage: storage,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB限制
  },
  fileFilter: (req, file, cb) => {
    // 增强的文件验证
    const allowedMimeTypes = ['application/json', 'text/json'];
    const allowedExtensions = ['.json'];

    // 检查MIME类型
    if (!allowedMimeTypes.includes(file.mimetype)) {
      return cb(new Error('Only JSON files are allowed'));
    }

    // 检查文件扩展名
    const fileExtension = path.extname(file.originalname).toLowerCase();
    if (!allowedExtensions.includes(fileExtension)) {
      return cb(new Error('File must have .json extension'));
    }

    // 检查文件名安全性（防止路径遍历攻击）
    const fileName = path.basename(file.originalname);
    if (fileName !== file.originalname || fileName.includes('..') || fileName.includes('/') || fileName.includes('\\')) {
      return cb(new Error('Invalid file name'));
    }

    cb(null, true);
  }
});

export function createUploadRoutes(
  keyManager: KeyManager,
  translationKeyManager: TranslationKeyManager,
  billingService?: BillingService,
  schedulerService?: SchedulerService
) {

  // 批量创建Azure资源路由
  router.post('/create-resources', upload.single('file'), async (req, res) => {
    try {
      if (!req.file) {
        const response: AzureResourceCreationResponse = {
          success: false,
          message: 'No file uploaded'
        };
        return res.status(400).json(response);
      }

      const fileContent = req.file.buffer.toString('utf8');
      let creationRequest: AzureResourceCreationRequest;
      
      try {
        creationRequest = JSON.parse(fileContent);

        // 验证JSON结构和内容安全性
        if (!creationRequest || typeof creationRequest !== 'object') {
          throw new Error('Invalid JSON structure');
        }

        // 检查是否包含潜在危险的属性
        const dangerousKeys = ['__proto__', 'constructor', 'prototype'];
        const jsonString = JSON.stringify(creationRequest);
        for (const key of dangerousKeys) {
          if (jsonString.includes(key)) {
            throw new Error('JSON contains potentially dangerous properties');
          }
        }

      } catch (parseError) {
        const response: AzureResourceCreationResponse = {
          success: false,
          message: `Invalid JSON format: ${parseError instanceof Error ? parseError.message : 'Unknown error'}`
        };
        return res.status(400).json(response);
      }

      if (!creationRequest.credentials || !creationRequest.resourceType) {
        const response: AzureResourceCreationResponse = {
          success: false,
          message: 'Invalid request format. Expected credentials and resourceType.'
        };
        return res.status(400).json(response);
      }

      const azureResourceService = new AzureResourceService();
      
      try {
        const resourceResult = await azureResourceService.createResource(creationRequest);
        
        if (resourceResult.success && resourceResult.data) {
          // 将创建的资源添加到密钥管理器
          try {
            const selectedKeyManager = creationRequest.resourceType === 'translation' ? translationKeyManager : keyManager;
            const createdKey = await selectedKeyManager.addKey(
              resourceResult.data.keys.key1,
              resourceResult.data.location,
              resourceResult.data.resourceName
            );
            
            if (creationRequest.options?.enableAfterCreate) {
              await selectedKeyManager.enableKey(resourceResult.data.keys.key1);
            }
            
            const response: AzureResourceCreationResponse = {
              success: true,
              data: resourceResult.data,
              message: `Azure ${creationRequest.resourceType === 'speech' ? '语音' : '翻译'}服务资源创建成功并已添加到系统`
            };
            
            logger.info(`Azure resource created and added: ${resourceResult.data.resourceName}`);
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
          return res.status(400).json(resourceResult);
        }
      } catch (error) {
        logger.error('Error creating Azure resource:', error);
        const response: AzureResourceCreationResponse = {
          success: false,
          message: error instanceof Error ? error.message : 'Unknown error'
        };
        return res.status(500).json(response);
      }

    } catch (error) {
      logger.error('Resource creation error:', error);
      const response: AzureResourceCreationResponse = {
        success: false,
        message: error instanceof Error ? error.message : 'Unknown error'
      };
      return res.status(500).json(response);
    }
  });

  // 批量创建资源key路由
  router.post('/create-resource-keys', upload.single('file'), async (req, res) => {
    try {
      if (!req.file) {
        const response: ResourceKeyCreationResponse = {
          success: false,
          data: {
            total: 0,
            success: 0,
            failed: 0,
            results: [],
            createdKeys: []
          },
          message: 'No file uploaded'
        };
        return res.status(400).json(response);
      }

      const fileContent = req.file.buffer.toString('utf8');
      let creationRequest: ResourceKeyCreationRequest;
      
      try {
        creationRequest = JSON.parse(fileContent);
      } catch (parseError) {
        const response: ResourceKeyCreationResponse = {
          success: false,
          data: {
            total: 0,
            success: 0,
            failed: 0,
            results: [],
            createdKeys: []
          },
          message: 'Invalid JSON format'
        };
        return res.status(400).json(response);
      }

      if (!creationRequest.keys || !Array.isArray(creationRequest.keys)) {
        const response: ResourceKeyCreationResponse = {
          success: false,
          data: {
            total: 0,
            success: 0,
            failed: 0,
            results: [],
            createdKeys: []
          },
          message: 'Invalid request format. Expected keys array.'
        };
        return res.status(400).json(response);
      }

      const results: ResourceKeyCreationResult[] = [];
      const createdKeys: (AzureKey | TranslationKey)[] = [];
      let successCount = 0;
      let failedCount = 0;

      for (const keyItem of creationRequest.keys) {
        try {
          if (!keyItem.key || !keyItem.region) {
            results.push({
              key: keyItem.key || 'unknown',
              success: false,
              message: 'Missing required fields: key and region',
              error: 'Missing required fields'
            });
            failedCount++;
            continue;
          }

          const selectedKeyManager = creationRequest.type === 'translation' ? translationKeyManager : keyManager;
          const addedKey = await selectedKeyManager.addKey(keyItem.key, keyItem.region, keyItem.keyname);
          
          if (creationRequest.options?.enableAfterCreate) {
            await selectedKeyManager.enableKey(keyItem.key);
          }
          
          results.push({
            key: keyItem.key,
            success: true,
            message: `${creationRequest.type === 'speech' ? '语音' : '翻译'}资源key创建成功`,
            resourceId: addedKey.id?.toString(),
            endpoint: `https://${keyItem.region}.api.cognitive.microsoft.com/`
          });
          
          createdKeys.push(addedKey);
          successCount++;
        } catch (error) {
          logger.error(`Error adding key ${keyItem.keyname}:`, error);
          results.push({
            key: keyItem.key || 'unknown',
            success: false,
            message: '创建失败',
            error: error instanceof Error ? error.message : 'Unknown error'
          });
          failedCount++;
        }
      }

      const response: ResourceKeyCreationResponse = {
        success: successCount > 0,
        data: {
          total: creationRequest.keys.length,
          success: successCount,
          failed: failedCount,
          results: results,
          createdKeys: createdKeys
        },
        message: `批量创建${creationRequest.type}资源完成: 成功${successCount}个, 失败${failedCount}个`
      };

      const statusCode = successCount > 0 ? (failedCount > 0 ? 207 : 200) : 400;
      return res.status(statusCode).json(response);

    } catch (error) {
      logger.error('Key creation error:', error);
      const response: ResourceKeyCreationResponse = {
        success: false,
        data: {
          total: 0,
          success: 0,
          failed: 0,
          results: [],
          createdKeys: []
        },
        message: error instanceof Error ? error.message : 'Unknown error'
      };
      return res.status(500).json(response);
    }
  });

  // JSON上传账单查询路由 - 调用az.py实现
  router.post('/billing-query', upload.single('file'), (req, res) => {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        error: 'No file uploaded'
      });
    }

    // 解析上传的JSON文件
    const fileContent = req.file.buffer.toString('utf8');
    let credentials;
    
    try {
      credentials = JSON.parse(fileContent);
    } catch (parseError) {
      return res.status(400).json({
        success: false,
        error: 'Invalid JSON format'
      });
    }

    // 验证必要的字段
    if (!credentials.appId || !credentials.password || !credentials.tenant) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: appId, password, tenant'
      });
    }

    // 删除旧的汇总文件以确保重新生成
    const summaryPath = path.join(__dirname, '../../tests/speech_service_costs_summary.json');
    const fs = require('fs');
    if (fs.existsSync(summaryPath)) {
      fs.unlinkSync(summaryPath);
    }

    // 调用az.py脚本
    const azPyPath = path.join(__dirname, '../../tests/az.py');
    const pythonProcess = spawn('python3', [azPyPath], {
      cwd: path.join(__dirname, '../../tests'),
      env: {
        ...process.env,
        AZURE_CLIENT_ID: credentials.appId,
        AZURE_CLIENT_SECRET: credentials.password,
        AZURE_TENANT_ID: credentials.tenant
      }
    });

    let output = '';
    let errorOutput = '';

    pythonProcess.stdout.on('data', (data) => {
      output += data.toString();
    });

    pythonProcess.stderr.on('data', (data) => {
      errorOutput += data.toString();
    });

    pythonProcess.on('close', (code) => {
      if (code !== 0) {
        logger.error('az.py execution failed:', errorOutput);
        return res.status(500).json({
          success: false,
          error: `Python script execution failed: ${errorOutput}`
        });
      }

      try {
        // 读取az.py生成的汇总文件
        const summaryPath = path.join(__dirname, '../../tests/speech_service_costs_summary.json');
        const fs = require('fs');
        
        if (!fs.existsSync(summaryPath)) {
          return res.status(500).json({
            success: false,
            error: 'Summary file not found'
          });
        }

        const summaryData = JSON.parse(fs.readFileSync(summaryPath, 'utf8'));
        
        // 处理数据格式
        let totalCost = 0;
        let subscriptionCount = 0;
        const subscriptions = [];
        
        for (const [subId, subData] of Object.entries(summaryData as any)) {
           subscriptionCount++;
           const costData = (subData as any).cost_data;
           let subTotalCost = 0;
           const resources: Array<{name: string, cost: number}> = [];
           
           if (costData && costData.properties && costData.properties.rows) {
             const rows = costData.properties.rows;
             
             // 按资源分组计算成本
             const resourceCosts: {[key: string]: number} = {};
             
             for (const row of rows) {
               if (row.length >= 3) {
                 const resourceName = row[1] || 'Unknown';
                 const cost = parseFloat(row[2]) || 0;
                 
                 if (resourceCosts[resourceName]) {
                   resourceCosts[resourceName] += cost;
                 } else {
                   resourceCosts[resourceName] = cost;
                 }
                 
                 subTotalCost += cost;
               }
             }
             
             // 转换为数组格式
             for (const [name, cost] of Object.entries(resourceCosts)) {
               resources.push({ name, cost });
             }
           }
           
           subscriptions.push({
             subscriptionId: subId,
             totalCost: subTotalCost,
             resources: resources
           });
           
           totalCost += subTotalCost;
        }

        return res.json({
          success: true,
          data: {
            totalCost: totalCost,
            subscriptionCount: subscriptionCount,
            subscriptions: subscriptions
          },
          message: `成功查询${subscriptionCount}个订阅的Speech服务账单，总成本$${totalCost.toFixed(2)}`
        });
      } catch (parseError) {
        logger.error('Failed to parse billing data:', parseError);
        return res.status(500).json({
          success: false,
          error: 'Failed to parse billing data: ' + (parseError instanceof Error ? parseError.message : 'Unknown error')
        });
      }
    });

    pythonProcess.on('error', (error) => {
      logger.error('Python process error:', error);
      return res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    });
    
    // 显式返回以满足TypeScript要求
    return
  });

  return router;
}

export default router;
