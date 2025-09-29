# Azure Speech Key Manager - Docker部署指南

## 🎯 概述

本指南将帮助您使用Docker快速部署Azure Speech Key Manager，确保所有功能正常工作。

## ✅ 系统要求

- **Docker**: 版本 20.10 或更高
- **Docker Compose**: 版本 2.0 或更高
- **系统内存**: 至少 2GB 可用内存
- **磁盘空间**: 至少 5GB 可用空间
- **网络端口**: 3000 和 3019 端口可用

## 🚀 快速启动

### 1. 克隆项目
```bash
git clone <your-repository-url>
cd azure_speech_keymanager
```

### 2. 启动服务
```bash
# 构建并启动所有服务
docker-compose up --build

# 或者后台运行
docker-compose up --build -d
```

### 3. 访问应用
- **前端界面**: http://localhost:3000
- **后端API**: http://localhost:3019
- **健康检查**: http://localhost:3019/api/health

## 📋 服务组件

### 应用服务 (app)
- **前端**: Next.js (端口 3000)
- **后端**: Node.js/Express (端口 3019)
- **功能**: 密钥管理、账单查询、系统设置

### 数据库服务 (mysql_azkm)
- **类型**: MySQL 8.0
- **端口**: 3306 (内部)
- **数据库**: azure_speech_keymanager

### 缓存服务 (redis_azkm)
- **类型**: Redis 7
- **端口**: 6379 (内部)
- **用途**: 会话管理、缓存

## 🔧 配置说明

### 环境变量配置
主要配置文件：`.env.docker`

```bash
# 应用配置
NODE_ENV=production
PORT=3019
BACKEND_PORT=3019
FRONTEND_PORT=3000
DOCKER_ENV=true

# 数据库配置
DB_HOST=mysql_azkm
DB_PORT=3306
DB_USER=azure_speech_keymanager
DB_PASSWORD=azure_speech_keymanager
DB_NAME=azure_speech_keymanager

# Redis配置
REDIS_URL=redis://redis_azkm:6379

# API配置
NEXT_PUBLIC_API_URL=

# 可选配置
# AZURE_CLIENT_ID=your-client-id
# AZURE_CLIENT_SECRET=your-client-secret
# AZURE_TENANT_ID=your-tenant-id
# FEISHU_WEBHOOK_URL=your-webhook-url
```

### 自定义配置
如需修改配置，请编辑 `.env.docker` 文件，然后重新启动服务：

```bash
docker-compose down
docker-compose up --build
```

## 🛠️ 常用命令

### 服务管理
```bash
# 启动服务
docker-compose up -d

# 停止服务
docker-compose down

# 重启服务
docker-compose restart

# 查看服务状态
docker-compose ps

# 查看日志
docker-compose logs -f app
```

### 数据管理
```bash
# 备份数据库
docker-compose exec mysql_azkm mysqldump -u azure_speech_keymanager -p azure_speech_keymanager > backup.sql

# 恢复数据库
docker-compose exec -T mysql_azkm mysql -u azure_speech_keymanager -p azure_speech_keymanager < backup.sql

# 清理数据卷
docker-compose down -v
```

### 调试命令
```bash
# 进入应用容器
docker-compose exec app sh

# 查看应用日志
docker-compose logs app --tail=50

# 健康检查
docker-compose exec app /app/docker-health-check.sh

# 检查网络连接
docker-compose exec app wget -qO- http://localhost:3019/api/health
```

## 🔍 故障排除

### 常见问题

#### 1. 端口冲突
**错误**: `bind: address already in use`
**解决**: 
```bash
# 查找占用端口的进程
lsof -i :3000
lsof -i :3019

# 停止占用进程或修改docker-compose.yml中的端口映射
```

#### 2. 前端无法连接后端
**症状**: 前端显示"Internal Server Error"
**解决**: 
```bash
# 检查后端健康状态
curl http://localhost:3019/api/health

# 查看应用日志
docker-compose logs app --tail=20

# 重启服务
docker-compose restart app
```

#### 3. 数据库连接失败
**症状**: 后端日志显示数据库连接错误
**解决**:
```bash
# 检查MySQL服务状态
docker-compose ps mysql_azkm

# 查看MySQL日志
docker-compose logs mysql_azkm

# 重启MySQL服务
docker-compose restart mysql_azkm
```

#### 4. 内存不足
**症状**: 容器频繁重启或构建失败
**解决**:
- 增加Docker可用内存（推荐4GB+）
- 关闭其他不必要的应用程序

### 日志分析
```bash
# 查看所有服务日志
docker-compose logs

# 查看特定服务日志
docker-compose logs mysql_azkm
docker-compose logs redis_azkm
docker-compose logs app

# 实时查看日志
docker-compose logs -f app
```

## 📊 性能优化

### 生产环境建议
1. **资源配置**:
   - CPU: 2核心或更多
   - 内存: 4GB或更多
   - 存储: SSD推荐

2. **网络配置**:
   - 使用反向代理（如Nginx）
   - 启用HTTPS
   - 配置防火墙规则

3. **监控配置**:
   - 设置日志轮转
   - 配置健康检查
   - 监控资源使用情况

### 扩展配置
```yaml
# docker-compose.override.yml 示例
version: '3.8'
services:
  app:
    deploy:
      resources:
        limits:
          memory: 2G
          cpus: '1.0'
        reservations:
          memory: 1G
          cpus: '0.5'
```

## 🔐 安全建议

1. **修改默认密码**: 更改MySQL root密码和应用数据库密码
2. **网络隔离**: 使用Docker网络隔离服务
3. **数据加密**: 配置SSL/TLS证书
4. **访问控制**: 限制管理接口访问
5. **定期更新**: 保持Docker镜像和依赖更新

## 📞 技术支持

如遇到问题，请提供以下信息：
1. 操作系统版本
2. Docker和Docker Compose版本
3. 错误日志内容
4. 服务状态输出

```bash
# 收集系统信息
docker --version
docker-compose --version
docker-compose ps
docker-compose logs app --tail=50
```

---

**部署成功后，您将拥有一个完全功能的Azure Speech Key Manager系统！** 🎉
