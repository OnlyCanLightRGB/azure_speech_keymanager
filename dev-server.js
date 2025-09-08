const express = require('express');
const cors = require('cors');
const path = require('path');

const app = express();
const port = process.env.PORT || 3019;

// 中间件
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// 健康检查
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'development',
    message: 'Azure Speech Key Manager API is running'
  });
});

// 基本API路由
app.get('/api', (req, res) => {
  res.json({
    message: 'Azure Speech Key Manager API',
    version: '1.0.0',
    endpoints: [
      '/api/health',
      '/api/keys',
      '/api/translation',
      '/api/config',
      '/api/billing'
    ]
  });
});

// 模拟密钥管理API
app.get('/api/keys', (req, res) => {
  res.json({
    message: 'Keys endpoint (mock)',
    status: 'development mode - database not connected'
  });
});

// 模拟翻译API
app.get('/api/translation', (req, res) => {
  res.json({
    message: 'Translation endpoint (mock)',
    status: 'development mode - database not connected'
  });
});

// 模拟配置API
app.get('/api/config', (req, res) => {
  res.json({
    message: 'Config endpoint (mock)',
    status: 'development mode - database not connected'
  });
});

// 模拟计费API
app.get('/api/billing', (req, res) => {
  res.json({
    message: 'Billing endpoint (mock)',
    status: 'development mode - database not connected'
  });
});

// 启动服务器
app.listen(port, '0.0.0.0', () => {
  console.log(`🚀 开发服务器启动成功！`);
  console.log(`📍 服务器地址: http://localhost:${port}`);
  console.log(`🔍 健康检查: http://localhost:${port}/api/health`);
  console.log(`📚 API文档: http://localhost:${port}/api`);
  console.log(`⚠️  注意: 这是开发模式，数据库未连接`);
});

// 优雅关闭
process.on('SIGTERM', () => {
  console.log('收到SIGTERM信号，正在关闭服务器...');
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('收到SIGINT信号，正在关闭服务器...');
  process.exit(0);
});

