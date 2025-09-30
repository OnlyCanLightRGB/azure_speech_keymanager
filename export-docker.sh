#!/bin/bash

# Azure Speech Key Manager - Docker镜像导出脚本
# 用于将系统打包到另一台电脑运行

set -e

echo "🎯 开始导出Azure Speech Key Manager Docker镜像..."

# 创建导出目录
EXPORT_DIR="azure_speech_keymanager_export"
mkdir -p "$EXPORT_DIR"

echo "📦 1. 导出应用镜像..."
# 导出主应用镜像
docker save azure_speech_keymanager-main-app:latest -o "$EXPORT_DIR/app-image.tar"
echo "✅ 应用镜像导出完成: $EXPORT_DIR/app-image.tar"

echo "📦 2. 导出MySQL镜像..."
# 导出MySQL镜像
docker save mysql:5.7 -o "$EXPORT_DIR/mysql-image.tar"
echo "✅ MySQL镜像导出完成: $EXPORT_DIR/mysql-image.tar"

echo "📦 3. 导出Redis镜像..."
# 导出Redis镜像
docker save redis:7-alpine -o "$EXPORT_DIR/redis-image.tar"
echo "✅ Redis镜像导出完成: $EXPORT_DIR/redis-image.tar"

echo "📋 4. 复制配置文件..."
# 复制必要的配置文件
cp docker-compose.yml "$EXPORT_DIR/"
cp -r database "$EXPORT_DIR/"
cp .env.docker "$EXPORT_DIR/" 2>/dev/null || echo "# Docker环境变量配置文件缺失" > "$EXPORT_DIR/.env.docker"
cp .env.example "$EXPORT_DIR/.env" 2>/dev/null || echo "# 环境变量配置文件" > "$EXPORT_DIR/.env"

echo "📝 5. 创建导入脚本..."
# 创建导入脚本
cat > "$EXPORT_DIR/import-and-run.sh" << 'EOF'
#!/bin/bash

# Azure Speech Key Manager - Docker镜像导入和运行脚本

set -e

echo "🎯 开始导入Azure Speech Key Manager Docker镜像..."

echo "📥 1. 导入应用镜像..."
docker load -i app-image.tar
echo "✅ 应用镜像导入完成"

echo "📥 2. 导入MySQL镜像..."
docker load -i mysql-image.tar
echo "✅ MySQL镜像导入完成"

echo "📥 3. 导入Redis镜像..."
docker load -i redis-image.tar
echo "✅ Redis镜像导入完成"

echo "🚀 4. 启动服务..."
docker-compose up -d

echo "⏳ 5. 等待服务启动..."
sleep 30

echo "🔍 6. 检查服务状态..."
docker-compose ps

echo "🎉 部署完成！"
echo ""
echo "📍 访问地址："
echo "  前端: http://localhost:3000"
echo "  后端: http://localhost:3019"
echo ""
echo "🔧 管理命令："
echo "  查看日志: docker-compose logs -f"
echo "  停止服务: docker-compose down"
echo "  重启服务: docker-compose restart"
echo ""
echo "✅ 系统已成功部署并运行！"
EOF

chmod +x "$EXPORT_DIR/import-and-run.sh"

echo "📝 6. 创建README文件..."
# 创建README文件
cat > "$EXPORT_DIR/README.md" << 'EOF'
# Azure Speech Key Manager - Docker部署包

## 📦 包含内容

- `app-image.tar` - 主应用Docker镜像
- `mysql-image.tar` - MySQL数据库镜像  
- `redis-image.tar` - Redis缓存镜像
- `docker-compose.yml` - Docker编排配置
- `database/` - 数据库初始化脚本
- `.env` - 环境变量配置
- `import-and-run.sh` - 一键导入运行脚本

## 🚀 快速部署

### 前提条件
- 已安装Docker和Docker Compose
- 端口3000和3019未被占用

### 部署步骤

1. **解压部署包**
   ```bash
   # 如果是压缩包，先解压
   tar -xzf azure_speech_keymanager_export.tar.gz
   cd azure_speech_keymanager_export
   ```

2. **一键部署**
   ```bash
   chmod +x import-and-run.sh
   ./import-and-run.sh
   ```

3. **访问系统**
   - 前端界面: http://localhost:3000
   - 后端API: http://localhost:3019

## 🔧 管理命令

```bash
# 查看服务状态
docker-compose ps

# 查看日志
docker-compose logs -f

# 停止服务
docker-compose down

# 重启服务
docker-compose restart

# 完全清理（包括数据）
docker-compose down --volumes
```

## 📋 功能验证

部署完成后，可以通过以下方式验证：

1. **健康检查**
   ```bash
   curl http://localhost:3000/api/health
   ```

2. **前端界面**
   - 打开浏览器访问 http://localhost:3000
   - 应该看到"Azure 语音服务密钥管理器"界面

3. **功能测试**
   - 导航到"JSON上传管理"页面
   - 上传JSON配置文件测试

## ❓ 常见问题

**Q: 端口被占用怎么办？**
A: 修改docker-compose.yml中的端口映射

**Q: 服务启动失败？**
A: 检查Docker和Docker Compose版本，查看日志排查问题

**Q: 数据持久化？**
A: 数据存储在Docker卷中，使用`docker-compose down`不会删除数据
EOF

echo "📊 7. 显示文件大小..."
echo "导出文件大小："
ls -lh "$EXPORT_DIR"/*.tar

echo "💾 8. 创建压缩包..."
tar -czf "${EXPORT_DIR}.tar.gz" "$EXPORT_DIR"
echo "✅ 压缩包创建完成: ${EXPORT_DIR}.tar.gz"

echo ""
echo "🎉 Docker镜像导出完成！"
echo ""
echo "📁 导出内容："
echo "  - 目录: $EXPORT_DIR/"
echo "  - 压缩包: ${EXPORT_DIR}.tar.gz"
echo ""
echo "📋 下一步操作："
echo "  1. 将 ${EXPORT_DIR}.tar.gz 传输到目标电脑"
echo "  2. 在目标电脑上解压: tar -xzf ${EXPORT_DIR}.tar.gz"
echo "  3. 进入目录: cd $EXPORT_DIR"
echo "  4. 运行部署: ./import-and-run.sh"
echo ""
echo "✅ 准备就绪！可以在另一台电脑上部署了！"
