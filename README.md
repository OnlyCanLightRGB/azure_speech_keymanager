# Azure Speech Services Key Manager

Azure语音服务密钥管理系统 - 一个全面的基于Web的Azure语音服务API密钥管理系统，具有自动冷却管理、使用跟踪和监控功能。

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![TypeScript](https://img.shields.io/badge/TypeScript-007ACC?style=flat&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Next.js](https://img.shields.io/badge/Next.js-000000?style=flat&logo=next.js&logoColor=white)](https://nextjs.org/)
[![Express.js](https://img.shields.io/badge/Express.js-404D59?style=flat&logo=express&logoColor=white)](https://expressjs.com/)
[![MySQL](https://img.shields.io/badge/MySQL-00000F?style=flat&logo=mysql&logoColor=white)](https://www.mysql.com/)
[![Redis](https://img.shields.io/badge/Redis-DC382D?style=flat&logo=redis&logoColor=white)](https://redis.io/)

## 🚀 主要特性

### 后端 (TypeScript + Express)
- **密钥管理**: 添加、删除、启用/禁用Azure语音服务密钥
- **智能密钥轮换**: 自动选择可用密钥并进行负载均衡
- **冷却管理**: 对受限制的密钥进行自动冷却和恢复
- **状态管理**: 对认证错误的密钥进行自动禁用
- **使用跟踪**: 监控密钥使用统计和错误率
- **全面日志**: 详细的操作日志和审计跟踪
- **密钥测试**: 内置TTS和STT测试功能
- **RESTful API**: 完整的REST API支持所有操作
- **JSON上传管理**: 支持通过JSON文件实时创建语音和翻译资源密钥
- **批量操作**: 支持批量创建、验证和管理多个密钥

### 前端 (Next.js + Material UI)
- **仪表板**: 实时系统概览和密钥统计
- **密钥管理**: 可视化密钥管理界面，支持批量操作
- **JSON上传管理**: 专门的上传页面，支持资源创建、验证和模板下载
- **日志查看器**: 可搜索和过滤的操作日志
- **设置面板**: 配置冷却时间、状态码和系统参数
- **实时更新**: 自动刷新数据和状态指示器
- **中文界面**: 完整的中文用户界面

### 数据库 (MySQL + Redis)
- **密钥存储**: 安全的密钥存储和元数据管理
- **使用分析**: 跟踪使用模式和错误率
- **配置管理**: 灵活的系统配置
- **审计日志**: 完整的操作历史记录
- **缓存支持**: Redis缓存提高性能和并发安全

## 🔄 新增功能

### JSON上传管理
- **实时资源创建**: 通过JSON文件批量创建语音和翻译服务密钥
- **智能验证**: 自动验证密钥格式、区域和有效性
- **模板系统**: 提供预配置的JSON模板，支持快速配置
- **批量操作**: 一次性处理多个密钥，提高管理效率
- **灵活配置**: 支持多种创建选项和自定义配置

### 支持的服务类型
- **语音服务 (Speech)**: TTS、STT、对话转录等
- **翻译服务 (Translation)**: 文本翻译、语音翻译、文档翻译等

### 支持的配置选项
- 创建前验证
- 创建后自动启用
- 覆盖已存在密钥
- 设置默认区域
- 自定义端点配置

### 项目维护工具
- **清理脚本**: 自动清理临时文件、缓存和构建产物
- **项目统计**: 实时统计项目文件类型和数量
- **配置检查**: 验证.gitignore和package.json配置
- **环境检查**: 检查开发环境和依赖状态

## 🛠️ 技术栈

- **后端**: TypeScript, Express.js, Node.js
- **前端**: Next.js, React, Material UI
- **数据库**: MySQL 8.0+, Redis
- **开发工具**: ESLint, TypeScript, Nodemon
- **维护工具**: 自动清理脚本, 项目统计工具
- **部署**: Docker支持, 生产环境脚本

## 📦 快速开始

### 环境要求
- Node.js 18+
- MySQL 8.0+
- Redis (必需，用于冷却管理和高并发场景)
- Azure语音服务订阅

### 安装步骤

1. **安装依赖服务**

**MySQL安装**
```bash
# Ubuntu/Debian
sudo apt update
sudo apt install mysql-server

# Windows
# 下载并安装 MySQL 8.0+ 从官网
# https://dev.mysql.com/downloads/mysql/

# macOS
brew install mysql
```

**Redis安装**
```bash
# Ubuntu/Debian
sudo apt install redis-server

# Windows
# 下载Redis for Windows或使用WSL
# 或者从 https://github.com/microsoftarchive/redis/releases 下载

# macOS
brew install redis

# 启动Redis服务
redis-server
```

2. **克隆项目并安装依赖**
```bash
git clone https://github.com/your-username/azure-speech-keymanager.git
cd azure-speech-keymanager
npm run setup
```

3. **配置环境变量**
```bash
cp .env.example .env
# 编辑 .env 文件，配置数据库和Redis连接信息
```

4. **设置数据库**
```bash
# 创建MySQL数据库
mysql -u root -p
CREATE DATABASE azure_speech_keymanager;

# 导入数据库结构
mysql -u root -p azure_speech_keymanager < database/init.sql
```

5. **清理和准备环境**
```bash
# 清理临时文件和缓存（可选）
node scripts/cleanup.js
```

6. **启动服务**
```bash
# 确保MySQL和Redis服务已启动
sudo systemctl start mysql redis-server  # Linux
# 或手动启动服务

# 启动开发服务器
npm run dev
```

这将启动：
- 后端API服务器: http://localhost:3019
- 前端开发服务器: http://localhost:3000

## 🔧 生产部署

### 传统部署
1. **构建应用**
```bash
npm run build
```

2. **启动生产服务器**
```bash
npm start
```

### Docker部署
```bash

# 构建并启动
docker-compose build && docker-compose up -d

# 停止服务
docker-compose down
```


## 📚 文档

- **API文档**: [API_QUICK_REFERENCE.md](./API_QUICK_REFERENCE.md) - 完整的API接口文档和SDK使用示例
- **更新日志**: [CHANGELOG.md](./CHANGELOG.md) - 版本更新记录

## 🎯 核心功能

### 智能密钥管理
- **全局密钥池**: 支持多个Azure语音服务密钥的统一管理
- **自动轮换**: 智能选择可用密钥，实现负载均衡
- **状态监控**: 实时监控密钥状态，自动处理失效密钥

### 冷却机制
- **429错误处理**: 自动检测速率限制，将密钥设置为冷却状态
- **自动恢复**: 冷却期结束后自动恢复密钥可用状态
- **保护期**: 恢复后设置保护期，避免频繁触发冷却

### 高并发支持
- **Redis缓存**: 使用Redis确保高并发环境下的线程安全
- **全局密钥管理**: 支持每0.5秒更新的全局密钥池
- **批量操作**: 智能合并多个并发请求，减少API调用

## 🔧 配置说明

### 环境变量
```bash
# 数据库配置
DB_HOST=localhost
DB_PORT=3306
DB_USER=azure_speech_keymanager
DB_PASSWORD=your_password
DB_NAME=azure_speech_keymanager

# Redis配置
REDIS_URL=redis://localhost:6379

# 服务器配置
PORT=3019
NODE_ENV=development

# 前端配置
FRONTEND_PORT=3000
NEXT_PUBLIC_API_URL=http://localhost:3019

# 日志配置
LOG_LEVEL=info
```

### 系统配置
系统支持通过设置面板进行运行时配置：

- **冷却时长**: 密钥冷却时间（默认：300秒）
- **禁用状态码**: 触发密钥禁用的HTTP状态码（默认：401,404）
- **冷却状态码**: 触发冷却的HTTP状态码（默认：429）
- **保护期**: 冷却恢复后的保护时间（默认：5秒）

## 🤝 贡献

1. Fork 本仓库
2. 创建特性分支 (`git checkout -b feature/AmazingFeature`)
3. 提交更改 (`git commit -m 'Add some AmazingFeature'`)
4. 推送到分支 (`git push origin feature/AmazingFeature`)
5. 打开 Pull Request

## 📄 许可证

本项目采用 MIT 许可证 - 查看 [LICENSE](LICENSE) 文件了解详情

## 🧹 维护和故障排除

### 清理临时文件
```bash
# 运行清理脚本
node scripts/cleanup.js

# 清理内容包括：
# - logs/ 目录下的日志文件
# - dist/ 构建产物
# - frontend/.next/ Next.js缓存
# - tests/__pycache__/ Python缓存
# - *.log 日志文件
# - dump.rdb Redis备份文件
```

### 项目统计
清理脚本会自动显示项目统计信息：
- 文件类型分布
- 代码行数统计
- 配置文件检查
- 环境状态验证

## 🆘 支持

如有问题和疑问：
1. 查看 [API文档](./API_QUICK_REFERENCE.md)
2. 运行清理脚本检查环境状态
3. 检查应用程序日志
4. 创建包含详细信息的issue

## 📊 使用统计

- **支持的API**: TTS (文本转语音) 和 STT (语音转文本)
- **并发能力**: 支持3000+ RPM的高并发场景
- **密钥管理**: 智能轮换和自动故障恢复
- **监控功能**: 实时状态监控和详细日志记录