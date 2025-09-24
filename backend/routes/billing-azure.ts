import express from 'express';
import multer from 'multer';
import fs from 'fs';
import path from 'path';
import { spawn } from 'child_process';
import { promisify } from 'util';

const router = express.Router();

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
    
    try {
      // 1. 验证凭据文件格式
      const credentials = await validateAzureCredentials(credentialsPath);
      
      // 2. 执行账单查询脚本
      const result = await runAzureBillingScript(credentialsPath);
      
      // 3. 清理上传的文件
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

export default router;