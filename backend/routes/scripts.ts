import express from 'express';
import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs';
import { ApiResponse } from '../types';
import logger from '../utils/logger';

const router = express.Router();

/**
 * POST /api/scripts/test-cooldown - 执行冷却恢复测试脚本
 */
router.post('/test-cooldown', async (req, res) => {
  try {
    const { type } = req.body;
    let scriptPath: string;
    
    if (type === 'translation') {
      scriptPath = path.join(__dirname, '../../scripts/test-translation-cooldown-recovery.js');
    } else {
      // 默认为语音密钥测试
      scriptPath = path.join(__dirname, '../../scripts/test-cooldown-recovery.js');
    }
    
    // 检查脚本文件是否存在
    if (!fs.existsSync(scriptPath)) {
      const response: ApiResponse = {
        success: false,
        error: '测试脚本文件不存在'
      };
      return res.status(404).json(response);
    }

    // 执行脚本
    const child = spawn('node', [scriptPath], {
      cwd: path.join(__dirname, '../..'),
      stdio: ['pipe', 'pipe', 'pipe']
    });

    let output = '';
    let errorOutput = '';

    child.stdout.on('data', (data) => {
      output += data.toString();
    });

    child.stderr.on('data', (data) => {
      errorOutput += data.toString();
    });

    child.on('close', (code) => {
      logger.info(`测试脚本执行完成，退出代码: ${code}`);
      
      const response: ApiResponse = {
        success: code === 0,
        data: {
          exitCode: code,
          output: output,
          error: errorOutput,
          timestamp: new Date().toISOString()
        },
        message: code === 0 ? '测试脚本执行成功' : '测试脚本执行失败'
      };

      res.json(response);
    });

    child.on('error', (error) => {
      logger.error('执行测试脚本时发生错误:', error);
      
      const response: ApiResponse = {
        success: false,
        error: `执行脚本失败: ${error.message}`
      };
      
      res.status(500).json(response);
    });

    // 设置超时
    const timeout = setTimeout(() => {
      if (!child.killed) {
        child.kill('SIGTERM');
        const response: ApiResponse = {
          success: false,
          error: '脚本执行超时（60秒）'
        };
        res.status(408).json(response);
      }
    }, 60000); // 60秒超时

    // 清理超时定时器
    child.on('close', () => {
      clearTimeout(timeout);
    });

  } catch (error: any) {
    logger.error('执行测试脚本时发生错误:', error);
    const response: ApiResponse = {
      success: false,
      error: error.message
    };
    return res.status(500).json(response);
  }
  
  // 异步操作，不需要显式返回
  return;
});

/**
 * POST /api/scripts/cleanup - 执行清理脚本
 */
router.post('/cleanup', async (req, res) => {
  try {
    const scriptPath = path.join(__dirname, '../../scripts/cleanup.js');
    
    // 检查脚本文件是否存在
    if (!fs.existsSync(scriptPath)) {
      const response: ApiResponse = {
        success: false,
        error: '清理脚本文件不存在'
      };
      return res.status(404).json(response);
    }

    // 执行脚本
    const child = spawn('node', [scriptPath], {
      cwd: path.join(__dirname, '../..'),
      stdio: ['pipe', 'pipe', 'pipe']
    });

    let output = '';
    let errorOutput = '';

    child.stdout.on('data', (data) => {
      output += data.toString();
    });

    child.stderr.on('data', (data) => {
      errorOutput += data.toString();
    });

    child.on('close', (code) => {
      logger.info(`清理脚本执行完成，退出代码: ${code}`);
      
      const response: ApiResponse = {
        success: code === 0,
        data: {
          exitCode: code,
          output: output,
          error: errorOutput,
          timestamp: new Date().toISOString()
        },
        message: code === 0 ? '清理脚本执行成功' : '清理脚本执行失败'
      };

      res.json(response);
    });

    child.on('error', (error) => {
      logger.error('执行清理脚本时发生错误:', error);
      
      const response: ApiResponse = {
        success: false,
        error: `执行脚本失败: ${error.message}`
      };
      
      res.status(500).json(response);
    });

    // 设置超时
    const timeout = setTimeout(() => {
      if (!child.killed) {
        child.kill('SIGTERM');
        const response: ApiResponse = {
          success: false,
          error: '脚本执行超时（30秒）'
        };
        res.status(408).json(response);
      }
    }, 30000); // 30秒超时

    // 清理超时定时器
    child.on('close', () => {
      clearTimeout(timeout);
    });

  } catch (error: any) {
    logger.error('执行清理脚本时发生错误:', error);
    const response: ApiResponse = {
      success: false,
      error: error.message
    };
    return res.status(500).json(response);
  }
  
  // 异步操作，不需要显式返回
  return;
});

/**
 * GET /api/scripts/list - 获取可用的测试脚本列表
 */
router.get('/list', async (req, res) => {
  try {
    const scriptsDir = path.join(__dirname, '../../scripts');
    
    if (!fs.existsSync(scriptsDir)) {
      const response: ApiResponse = {
        success: false,
        error: 'scripts目录不存在'
      };
      return res.status(404).json(response);
    }

    const files = fs.readdirSync(scriptsDir);
    const scripts = files
      .filter(file => file.endsWith('.js'))
      .map(file => {
        const scriptPath = path.join(scriptsDir, file);
        const stats = fs.statSync(scriptPath);
        
        return {
          name: file,
          path: file,
          size: stats.size,
          modified: stats.mtime.toISOString(),
          description: getScriptDescription(file)
        };
      });

    const response: ApiResponse = {
      success: true,
      data: scripts,
      message: '获取脚本列表成功'
    };

    res.json(response);
  } catch (error: any) {
    logger.error('获取脚本列表时发生错误:', error);
    const response: ApiResponse = {
      success: false,
      error: error.message
    };
    return res.status(500).json(response);
  }
  
  // 异步操作，不需要显式返回
  return;
});

/**
 * 获取脚本描述
 */
function getScriptDescription(filename: string): string {
  switch (filename) {
    case 'test-cooldown-recovery.js':
      return '测试密钥冷却恢复机制';
    case 'cleanup.js':
      return '清理系统数据和缓存';
    default:
      return '未知脚本';
  }
}

export default router;