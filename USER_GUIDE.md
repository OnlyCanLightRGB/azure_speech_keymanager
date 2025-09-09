# Azure 语音密钥管理系统 - 用户操作指南

## 系统概述

Azure 语音密钥管理系统是一个专业的 Azure 语音服务密钥管理平台，提供密钥轮换、负载均衡、冷却管理、翻译服务等功能。系统支持语音转文字(STT)、文字转语音(TTS)、语音翻译等多种 Azure 认知服务。

## 主要功能

- **密钥管理**: 自动轮换和负载均衡 Azure 语音服务密钥
- **冷却管理**: 智能冷却机制防止 API 限流
- **翻译服务**: 支持文本翻译和语音翻译
- **监控统计**: 实时监控密钥使用情况和系统状态
- **自动备份**: 数据库自动备份和迁移

## 快速开始

### 1. 系统部署

#### Docker 部署（推荐）

```bash
# 克隆项目
git clone <repository-url>
cd azure_speech_keymanager-main

# 配置环境变量
cp .env.example .env
# 编辑 .env 文件，填入您的配置信息

# 启动服务
docker-compose up -d
```

#### 本地开发部署

```bash
# 安装依赖
npm install
cd frontend && npm install && cd ..

# 配置数据库
# 确保 MySQL 和 Redis 服务运行

# 启动后端服务
npm run dev:backend

# 启动前端服务（新终端）
cd frontend && npm run dev
```

### 2. 环境配置

编辑 `.env` 文件，配置以下关键参数：

```env
# 数据库配置
DB_HOST=localhost
DB_PORT=3306
DB_USER=root
DB_PASSWORD=your_password
DB_NAME=azure_speech_keymanager

# Redis 配置
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=your_redis_password

# 服务端口
PORT=3001
FRONTEND_PORT=3000

# Azure 配置（可选）
AZURE_SUBSCRIPTION_ID=your_subscription_id
AZURE_RESOURCE_GROUP=your_resource_group
```

## 系统使用

### 1. 访问管理界面

系统启动后，通过浏览器访问：
- 前端界面: `http://localhost:3000`
- API 文档: `http://localhost:3001/api-docs`
- 健康检查: `http://localhost:3001/health`

### 2. 密钥管理

#### 添加 Azure 语音服务密钥

1. 访问 "密钥管理" 页面
2. 点击 "添加密钥" 按钮
3. 填入密钥信息：
   - 密钥名称
   - Azure 订阅密钥
   - 服务区域
   - 服务类型（STT/TTS）

#### 密钥状态管理

- **活跃**: 密钥正常可用
- **冷却**: 密钥暂时不可用，等待冷却
- **禁用**: 手动禁用的密钥
- **错误**: 密钥验证失败

### 3. 翻译服务使用

#### 添加翻译密钥

1. 访问 "翻译管理" 页面
2. 添加 Azure 翻译服务密钥
3. 配置支持的语言对

#### 使用翻译 API

**文本翻译**:
```bash
curl -X POST http://localhost:3001/api/translation/translate \
  -H "Content-Type: application/json" \
  -d '{
    "text": "Hello, world!",
    "from": "en",
    "to": "zh"
  }'
```

**语音翻译**:
```bash
curl -X POST http://localhost:3001/api/translation/translate-speech \
  -H "Content-Type: application/json" \
  -d '{
    "audioData": "base64_encoded_audio",
    "from": "en",
    "to": "zh",
    "format": "wav"
  }'
```

## API 接口说明

### 密钥管理 API

| 接口 | 方法 | 说明 |
|------|------|------|
| `/api/keys/get` | GET | 获取可用密钥 |
| `/api/keys/add` | POST | 添加新密钥 |
| `/api/keys/status` | POST | 设置密钥状态 |
| `/api/keys/test` | POST | 测试密钥有效性 |
| `/api/keys/logs` | GET | 获取密钥使用日志 |

### 翻译服务 API

| 接口 | 方法 | 说明 |
|------|------|------|
| `/api/translation/keys/get` | GET | 获取翻译密钥 |
| `/api/translation/translate` | POST | 文本翻译 |
| `/api/translation/translate-speech` | POST | 语音翻译 |
| `/api/translation/keys/test-speech` | POST | 测试语音翻译 |
| `/api/translation/keys/stats` | GET | 获取使用统计 |

### 系统监控 API

| 接口 | 方法 | 说明 |
|------|------|------|
| `/health` | GET | 系统健康检查 |
| `/api/billing/usage` | GET | 获取使用统计 |
| `/api/config/cooldown` | GET | 获取冷却配置 |

## 高级功能

### 1. 自动冷却管理

系统会自动监控 API 调用频率，当检测到可能的限流风险时，会自动将密钥设置为冷却状态。冷却时间可在配置中调整。

### 2. 负载均衡

系统支持多个密钥的负载均衡，会自动选择最优的可用密钥进行服务。

### 3. 数据备份

系统会自动进行数据库备份，备份文件存储在 `backups/` 目录下。

### 4. 监控告警

系统提供实时监控功能，可以监控：
- 密钥使用情况
- API 调用频率
- 系统资源使用
- 错误率统计

## 故障排除

### 常见问题

1. **密钥验证失败**
   - 检查密钥是否正确
   - 确认 Azure 服务区域设置
   - 验证 Azure 订阅状态

2. **服务无法启动**
   - 检查数据库连接
   - 确认 Redis 服务状态
   - 查看日志文件排查错误

3. **翻译服务异常**
   - 检查翻译密钥配置
   - 确认支持的语言对
   - 查看 API 调用限制

### 日志查看

```bash
# 查看后端服务日志
docker-compose logs backend

# 查看数据库日志
docker-compose logs mysql

# 查看 Redis 日志
docker-compose logs redis
```

## 性能优化

### 1. 数据库优化

- 定期清理过期日志
- 优化数据库索引
- 配置适当的连接池大小

### 2. Redis 优化

- 配置适当的内存限制
- 启用数据持久化
- 监控 Redis 性能指标

### 3. 系统监控

- 使用系统监控工具
- 设置性能告警
- 定期检查系统资源使用

## 安全建议

1. **密钥安全**
   - 定期轮换 Azure 服务密钥
   - 使用强密码保护数据库
   - 限制网络访问权限

2. **系统安全**
   - 及时更新系统依赖
   - 配置防火墙规则
   - 启用 HTTPS 访问

3. **数据安全**
   - 定期备份重要数据
   - 加密敏感信息
   - 监控异常访问

## 技术支持

如需技术支持，请提供以下信息：
- 系统版本信息
- 错误日志详情
- 问题复现步骤
- 系统环境配置

---

**注意**: 本系统需要有效的 Azure 订阅和相应的认知服务配额。使用前请确保已正确配置 Azure 服务和相关权限。