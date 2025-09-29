# 开发环境启动指南

## 问题解决

之前你的项目必须先运行 `npm run start` 再运行 `npm run dev` 的原因已经解决！

### 原因分析
1. **端口冲突**：开发环境和生产环境使用相同端口（3019、3000）
2. **环境配置混乱**：开发和生产环境共用同一个 `.env` 文件
3. **启动依赖**：开发环境依赖生产环境的初始化

### 解决方案
现在已经实施了完整的端口分离和环境配置：

## 新的端口配置

### 开发环境
- **后端服务器**: `http://localhost:3001`
- **前端服务器**: `http://localhost:3000` (Next.js 默认)
- **API 基础URL**: `http://localhost:3001/api`

### 生产环境
- **后端服务器**: `http://localhost:3019` (保持不变)
- **前端服务器**: 由后端服务器提供静态文件

## 启动命令

### 开发环境（推荐）
```bash
# 直接启动开发环境（不再需要先运行 npm run start）
npm run dev

# 如果遇到端口冲突，使用清理命令
npm run dev:clean
```

### 生产环境
```bash
# 构建项目
npm run build

# 启动生产环境
npm run start
```

### 其他有用命令
```bash
# 清理占用的端口
npm run kill-ports

# 安装依赖
npm run setup

# 清理构建文件和日志
npm run clean
```

## 环境变量文件

### 开发环境
- **根目录**: `.env.development`
- **前端**: `frontend/.env.development`

### 生产环境
- **根目录**: `.env`

## 验证启动

### 1. 检查后端健康状态
```bash
curl http://localhost:3001/api/health
```

### 2. 访问前端界面
打开浏览器访问: `http://localhost:3000`

### 3. 检查API文档
访问: `http://localhost:3001/api/docs`

## 故障排除

### 端口被占用
```bash
# 查看端口占用情况
lsof -i :3001
lsof -i :3000

# 清理端口
npm run kill-ports
```

### 数据库连接问题
确保 MySQL 和 Redis 服务正在运行：
```bash
# 检查 MySQL
mysql -u root -p -e "SELECT 1"

# 检查 Redis
redis-cli ping
```

### 环境变量问题
检查 `.env.development` 文件是否存在并包含正确的配置。

## 开发工作流

1. **启动开发环境**: `npm run dev`
2. **修改代码**: 后端和前端都支持热重载
3. **测试功能**: 使用 `http://localhost:3000` 访问前端
4. **API测试**: 使用 `http://localhost:3001/api/*` 测试后端API

现在你可以直接使用 `npm run dev` 启动开发环境，不再需要复杂的启动顺序！
