import express from 'express';
import multer from 'multer';
import fs from 'fs';
import path from 'path';
import { spawn } from 'child_process';
import { promisify } from 'util';
import mysql from 'mysql2/promise';
import { AutoBillingService, BillingHistoryRecord } from '../services/AutoBillingService';

const router = express.Router();

// 全局变量用于存储AutoBillingService实例
let autoBillingService: AutoBillingService | null = null;

// 设置AutoBillingService实例的函数
export function setAutoBillingService(service: AutoBillingService) {
  autoBillingService = service;
}

// 配置multer用于文件上传
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = path.join(__dirname, '../../uploads');
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    // 生成唯一文件名
    const timestamp = Date.now();
    const randomSuffix = Math.round(Math.random() * 1E9);
    cb(null, `azure_credentials_${timestamp}_${randomSuffix}.json`);
  }
});

const upload = multer({ 
  storage,
  fileFilter: (req, file, cb) => {
    // 只允许JSON文件
    if (file.mimetype === 'application/json' || file.originalname.endsWith('.json')) {
      cb(null, true);
    } else {
      cb(new Error('只允许上传JSON文件'));
    }
  },
  limits: {
    fileSize: 1024 * 1024 // 1MB限制
  }
});

/**
 * 验证Azure凭据JSON格式
 */
function validateAzureCredentials(credentialsPath: string): Promise<any> {
  return new Promise((resolve, reject) => {
    try {
      const credentialsData = fs.readFileSync(credentialsPath, 'utf-8');
      const credentials = JSON.parse(credentialsData);
      
      // 验证必需字段
      const requiredFields = ['appId', 'password', 'tenant'];
      for (const field of requiredFields) {
        if (!credentials[field]) {
          reject(new Error(`缺少必需字段: ${field}`));
          return;
        }
      }
      
      resolve(credentials);
    } catch (error: any) {
      reject(new Error(`JSON格式错误: ${error.message}`));
    }
  });
}

/**
 * 执行Azure账单查询脚本
 */
function runAzureBillingScript(credentialsPath: string): Promise<any> {
  return new Promise((resolve, reject) => {
    const scriptPath = path.join(__dirname, '../../az.py');
    const pythonProcess = spawn('python3', [scriptPath, credentialsPath], {
      cwd: path.join(__dirname, '../..')
    });
    
    let stdout = '';
    let stderr = '';
    
    pythonProcess.stdout.on('data', (data) => {
      stdout += data.toString();
    });
    
    pythonProcess.stderr.on('data', (data) => {
      stderr += data.toString();
    });
    
    pythonProcess.on('close', (code) => {
      if (code === 0) {
        // 查找生成的JSON文件
        const summaryFile = path.join(__dirname, '../../speech_service_costs_summary.json');
        if (fs.existsSync(summaryFile)) {
          try {
            const summaryData = JSON.parse(fs.readFileSync(summaryFile, 'utf-8'));
            resolve({
              success: true,
              output: stdout,
              data: summaryData
            });
          } catch (error) {
            resolve({
              success: true,
              output: stdout,
              data: null,
              message: '脚本执行成功，但无法解析结果文件'
            });
          }
        } else {
          resolve({
            success: true,
            output: stdout,
            data: null,
            message: '脚本执行成功，但未生成结果文件'
          });
        }
      } else {
        reject(new Error(`脚本执行失败 (退出码: ${code})\n标准输出: ${stdout}\n错误输出: ${stderr}`));
      }
    });
    
    pythonProcess.on('error', (error: any) => {
      reject(new Error(`无法启动Python脚本: ${error.message}`));
    });
  });
}

/**
 * POST /api/billing-azure/upload-credentials
 * 上传Azure凭据文件并查询账单
 */
router.post('/upload-credentials', upload.single('credentials'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        error: '未上传文件'
      });
    }
    
    const credentialsPath = req.file.path;
    const fileName = req.file.filename;
    
    try {
      // 1. 验证凭据文件格式
      const credentials = await validateAzureCredentials(credentialsPath);
      
      // 2. 执行账单查询脚本
      const result = await runAzureBillingScript(credentialsPath);
      
      // 3. 保存查询历史记录到数据库
      if (autoBillingService) {
        try {
          const queryStatus: 'success' | 'failed' | 'no_subscription' = result.success ? 
            (result.data ? 'success' : 'no_subscription') : 'failed';
          
          // 计算总费用和货币
          let totalCost: number | undefined = undefined;
          let currency: string | undefined = undefined;
          
          if (result.data && result.success) {
            let calculatedCost = 0;
            let detectedCurrency = 'USD';
            
            // 遍历所有订阅的费用数据
            Object.keys(result.data).forEach(subscriptionId => {
              const subscription = result.data[subscriptionId];
              if (subscription.cost_data?.properties?.rows) {
                subscription.cost_data.properties.rows.forEach((row: any[]) => {
                  const [cost, usage, date, resourceId, meter, rowCurrency] = row;
                  calculatedCost += cost || 0;
                  if (rowCurrency) {
                    detectedCurrency = rowCurrency;
                  }
                });
              }
            });
            
            if (calculatedCost > 0) {
              totalCost = calculatedCost;
              currency = detectedCurrency;
            }
          }
          
          // 使用原始文件名（去掉时间戳前缀）
          const originalFileName = req.file?.originalname || fileName.replace(/^\d+-/, '');
          
          const billingRecord = {
             fileName: originalFileName,
             filePath: credentialsPath,
             appId: credentials.appId,
             tenantId: credentials.tenant,
             displayName: credentials.displayName || 'Unknown',
             queryDate: new Date(),
             subscriptionId: result.data?.subscription_id || undefined,
             totalCost: totalCost,
             currency: currency,
             billingData: result.data ? JSON.stringify(result.data) : undefined,
             queryStatus: queryStatus,
             errorMessage: result.success ? undefined : result.output,
             lastModified: new Date()
           };
          
          await autoBillingService.saveJsonBillingRecord(billingRecord);
          console.log(`已保存账单查询历史记录: ${fileName}`);
        } catch (historyError) {
          console.error('保存历史记录失败:', historyError);
          // 不影响主要流程，继续执行
        }
      }
      
      // 4. 清理上传的文件
      fs.unlinkSync(credentialsPath);
      
      return res.json({
        success: true,
        message: 'Azure账单查询完成',
        credentials_info: {
          appId: credentials.appId,
          displayName: credentials.displayName || 'Unknown',
          tenant: credentials.tenant
        },
        result: result
      });
      
    } catch (error: any) {
      // 保存失败的查询记录
      if (autoBillingService) {
        try {
          const credentials = JSON.parse(fs.readFileSync(credentialsPath, 'utf-8'));
          // 使用原始文件名（去掉时间戳前缀）
          const originalFileName = req.file?.originalname || fileName.replace(/^\d+-/, '');
          
          const billingRecord = {
            fileName: originalFileName,
            filePath: credentialsPath,
            appId: credentials.appId || 'unknown',
            tenantId: credentials.tenant || 'unknown',
            displayName: credentials.displayName || 'Unknown',
            queryDate: new Date(),
            queryStatus: 'failed' as const,
            errorMessage: error.message || '账单查询失败',
            lastModified: new Date()
          };
          
          await autoBillingService.saveJsonBillingRecord(billingRecord);
          console.log(`已保存失败的账单查询历史记录: ${fileName}`);
        } catch (historyError) {
          console.error('保存失败历史记录失败:', historyError);
        }
      }
      
      // 清理上传的文件
      if (fs.existsSync(credentialsPath)) {
        fs.unlinkSync(credentialsPath);
      }
      
      console.error('Azure账单查询内部错误:', error);
      return res.status(400).json({
        success: false,
        error: error.message || '账单查询失败'
      });
    }
    
  } catch (error: any) {
      console.error('Azure账单查询外部错误:', error);
      return res.status(500).json({
        success: false,
        error: '服务器内部错误: ' + (error.message || '未知错误')
      });
  }
});

/**
 * GET /api/billing-azure/history
 * 获取账单查询历史记录
 */
router.get('/history', async (req, res) => {
  try {
    if (!autoBillingService) {
      return res.status(500).json({
        success: false,
        error: 'AutoBillingService未初始化'
      });
    }

    const { subscriptionId, startDate, endDate, limit } = req.query;
    
    // 参数验证和转换
    const parsedStartDate = startDate ? new Date(startDate as string) : undefined;
    const parsedEndDate = endDate ? new Date(endDate as string) : undefined;
    const parsedLimit = limit ? parseInt(limit as string, 10) : 50;

    // 验证日期格式
    if (startDate && isNaN(parsedStartDate!.getTime())) {
      return res.status(400).json({
        success: false,
        error: '开始日期格式无效'
      });
    }

    if (endDate && isNaN(parsedEndDate!.getTime())) {
      return res.status(400).json({
        success: false,
        error: '结束日期格式无效'
      });
    }

    // 验证limit范围
    if (parsedLimit < 1 || parsedLimit > 1000) {
      return res.status(400).json({
        success: false,
        error: 'limit参数必须在1-1000之间'
      });
    }

    // 获取历史记录
    const history = await autoBillingService.getBillingHistory(
      subscriptionId as string,
      parsedStartDate,
      parsedEndDate,
      parsedLimit
    );

    return res.json({
      success: true,
      data: history,
      total: history.length,
      filters: {
        subscriptionId: subscriptionId || null,
        startDate: parsedStartDate?.toISOString() || null,
        endDate: parsedEndDate?.toISOString() || null,
        limit: parsedLimit
      }
    });

  } catch (error: any) {
    console.error('获取账单历史记录失败:', error);
    return res.status(500).json({
      success: false,
      error: '获取账单历史记录失败: ' + (error.message || '未知错误')
    });
  }
});

/**
 * GET /api/billing-azure/example-credentials
 * 获取凭据文件格式示例
 */
router.get('/example-credentials', (req, res) => {
  const example = {
    appId: "your-app-id-here",
    displayName: "your-app-display-name",
    password: "your-app-password-here",
    tenant: "your-tenant-id-here"
  };
  
  res.json({
    success: true,
    example: example,
    instructions: [
      "1. 将上述JSON保存为文件（如 azure_credentials.json）",
      "2. 替换所有 'your-*-here' 为实际的Azure应用程序凭据",
      "3. 上传文件到 /api/billing-azure/upload-credentials 接口"
    ]
  });
});

// 获取JSON文件账单历史记录
router.get('/json-history', async (req, res) => {
  try {
    if (!autoBillingService) {
      return res.status(503).json({ 
        error: 'AutoBillingService not available',
        message: 'Service is not initialized'
      });
    }

    const { fileName, startDate, endDate, limit } = req.query;

    // 参数验证
    const parsedLimit = limit ? parseInt(limit as string) : 100;
    if (isNaN(parsedLimit) || parsedLimit < 1 || parsedLimit > 1000) {
      return res.status(400).json({ 
        error: 'Invalid limit parameter',
        message: 'Limit must be between 1 and 1000'
      });
    }

    let parsedStartDate: Date | undefined;
    let parsedEndDate: Date | undefined;

    if (startDate) {
      parsedStartDate = new Date(startDate as string);
      if (isNaN(parsedStartDate.getTime())) {
        return res.status(400).json({ 
          error: 'Invalid startDate parameter',
          message: 'startDate must be a valid date'
        });
      }
    }

    if (endDate) {
      parsedEndDate = new Date(endDate as string);
      if (isNaN(parsedEndDate.getTime())) {
        return res.status(400).json({ 
          error: 'Invalid endDate parameter',
          message: 'endDate must be a valid date'
        });
      }
    }

    const history = await autoBillingService.getJsonBillingHistory(
      fileName as string,
      parsedStartDate,
      parsedEndDate,
      parsedLimit
    );

    const totalCount = history.length;

    return res.json({
      success: true,
      data: {
        history,
        totalCount,
        filters: {
          fileName: fileName || null,
          startDate: parsedStartDate || null,
          endDate: parsedEndDate || null,
          limit: parsedLimit
        }
      }
    });

  } catch (error) {
     console.error('Error fetching JSON billing history:', error);
     return res.status(500).json({ 
       error: 'Internal server error',
       message: 'Failed to fetch JSON billing history'
     });
   }
 });

export { router as billingAzureRouter };