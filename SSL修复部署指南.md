# Azure Speech Key Manager - SSL修复部署指南

## 🚨 问题描述

客户在部署Docker时遇到MySQL SSL证书错误：
```
ERROR 2026 (HY000): TLS/SSL error: self-signed certificate in certificate chain
unknown variable 'ssl-mode=DISABLED'
```

## 🔧 修复内容

### 1. 修复的文件
- `docker-compose.yml` - MySQL容器SSL配置
- `start.sh` - 数据库迁移脚本SSL参数
- `deploy-fix-ssl.sh` - 自动化部署脚本（新增）

### 2. 主要修改
```yaml
# docker-compose.yml
mysql_azkm:
  image: mysql:8.0
  command: --skip-ssl --default-authentication-plugin=mysql_native_password
```

```bash
# start.sh 中所有mysql命令都添加了 --skip-ssl 参数
mysql -h"$DB_HOST" -u"$DB_USER" -p"$DB_PASSWORD" "$DB_NAME" --skip-ssl
```

## 🚀 客户部署步骤

### 方法一：使用自动化脚本（推荐）

1. **下载最新代码**
```bash
git pull origin main
# 或重新克隆仓库
```

2. **运行SSL修复部署脚本**
```bash
chmod +x deploy-fix-ssl.sh
./deploy-fix-ssl.sh
```

脚本会自动执行：
- ✅ 检查Docker环境
- ✅ 清理旧容器和镜像缓存
- ✅ 拉取最新镜像
- ✅ 构建应用镜像
- ✅ 启动所有服务
- ✅ 验证部署状态

### 方法二：手动部署

1. **清理Docker缓存**
```bash
# 停止现有容器
docker-compose down --remove-orphans

# 删除旧镜像（强制更新）
docker rmi mysql:8.0
docker rmi $(docker images -q azure_speech_keymanager-main-app)

# 清理系统缓存
docker system prune -f

# 可选：清理数据卷（会删除数据库数据）
docker volume rm $(docker volume ls -q | grep azure_speech_keymanager)
```

2. **重新构建和启动**
```bash
# 拉取最新镜像
docker pull mysql:8.0
docker pull redis:7-alpine
docker pull node:18-alpine

# 构建应用镜像
docker-compose build --no-cache app

# 启动服务
docker-compose up -d
```

3. **验证部署**
```bash
# 检查服务状态
docker-compose ps

# 检查应用健康状态
curl http://localhost:3019/api/health

# 查看日志（如有问题）
docker-compose logs app
```

## 🎯 验证成功标志

部署成功后应该看到：

1. **容器状态正常**
```bash
$ docker-compose ps
NAME                                        COMMAND                  SERVICE             STATUS              PORTS
azure_speech_keymanager-main-app-1         "/app/start.sh"          app                 running (healthy)   0.0.0.0:3000->3000/tcp, 0.0.0.0:3019->3019/tcp
azure_speech_keymanager-main-mysql_azkm-1  "docker-entrypoint.s…"   mysql_azkm          running (healthy)   3306/tcp, 33060/tcp
azure_speech_keymanager-main-redis_azkm-1  "docker-entrypoint.s…"   redis_azkm          running (healthy)   6379/tcp
```

2. **健康检查通过**
```json
{
  "success": true,
  "data": {
    "status": "healthy",
    "database": "connected",
    "redis": "connected",
    "keyManager": "running"
  }
}
```

3. **日志无SSL错误**
- 不再出现 `TLS/SSL error: self-signed certificate`
- 不再出现 `unknown variable 'ssl-mode=DISABLED'`
- 所有迁移显示 `completed successfully`

## ⚠️ 注意事项

### 1. 环境要求
- Docker 19.0+ 
- Docker Compose 1.25+
- 至少2GB可用内存
- 端口3000和3019未被占用

### 2. 数据安全
- 清理数据卷会删除所有数据库数据
- 建议在清理前备份重要数据
- 生产环境请谨慎使用数据卷清理

### 3. SSL安全性
- 当前配置禁用了SSL，适用于内网环境
- 生产环境建议配置正确的SSL证书
- 如需启用SSL，请联系技术支持

## 🐛 故障排除

### 1. 容器启动失败
```bash
# 查看详细日志
docker-compose logs mysql_azkm
docker-compose logs app

# 检查端口占用
netstat -tulpn | grep :3019
netstat -tulpn | grep :3000
```

### 2. 数据库连接失败
```bash
# 检查MySQL容器状态
docker exec -it azure_speech_keymanager-main-mysql_azkm-1 mysql -u root -p

# 检查网络连接
docker network ls
docker network inspect azure_speech_keymanager-main_azkm_network
```

### 3. 应用无响应
```bash
# 重启应用容器
docker-compose restart app

# 检查应用日志
docker-compose logs app --tail 100 -f
```

## 📞 技术支持

如遇到问题，请提供以下信息：
1. 操作系统版本
2. Docker版本信息
3. 错误日志截图
4. `docker-compose ps` 输出
5. `docker-compose logs app` 输出

---

**修复版本**: v1.1.0  
**修复日期**: 2025-09-30  
**适用环境**: MySQL 5.7+ / MySQL 8.0+
