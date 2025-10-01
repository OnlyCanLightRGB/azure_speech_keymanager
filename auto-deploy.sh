#!/bin/bash

# Azure Speech Key Manager - 完全自动化部署脚本
# 无需任何手动操作，一键完成所有部署步骤

set -e  # 遇到错误立即退出

echo "🚀 Azure Speech Key Manager - 完全自动化部署"
echo "=================================================="

# 检查系统要求
echo "🔍 检查系统要求..."

# 检查Docker
if ! command -v docker &> /dev/null; then
    echo "❌ Docker未安装，请先安装Docker"
    echo "安装指南: https://docs.docker.com/get-docker/"
    exit 1
fi

# 检查docker-compose
if ! command -v docker-compose &> /dev/null && ! docker compose version &> /dev/null; then
    echo "❌ docker-compose未安装，请先安装docker-compose"
    echo "安装指南: https://docs.docker.com/compose/install/"
    exit 1
fi

echo "✅ Docker环境检查通过"

# 检查端口占用
echo "🔍 检查端口占用..."
if lsof -i :3000 &> /dev/null; then
    echo "⚠️  端口3000被占用，正在尝试释放..."
    docker-compose down 2>/dev/null || true
    sleep 2
    if lsof -i :3000 &> /dev/null; then
        echo "❌ 端口3000仍被占用，请手动释放后重试"
        echo "可以运行: lsof -i :3000 查看占用进程"
        exit 1
    fi
fi

if lsof -i :3019 &> /dev/null; then
    echo "⚠️  端口3019被占用，正在尝试释放..."
    docker-compose down 2>/dev/null || true
    sleep 2
    if lsof -i :3019 &> /dev/null; then
        echo "❌ 端口3019仍被占用，请手动释放后重试"
        exit 1
    fi
fi

echo "✅ 端口检查通过"

# 清理旧的容器和镜像
echo "🧹 清理旧的部署..."
docker-compose down -v 2>/dev/null || true
docker system prune -f 2>/dev/null || true

# 构建和启动服务
echo "🔨 构建Docker镜像..."
docker-compose build

echo "🚀 启动服务..."
docker-compose up -d

# 等待服务启动
echo "⏳ 等待服务启动..."
sleep 30

# 健康检查
echo "🔍 服务健康检查..."
MAX_RETRIES=12
RETRY_COUNT=0

while [ $RETRY_COUNT -lt $MAX_RETRIES ]; do
    if curl -s http://localhost:3019/api/health | grep -q "healthy"; then
        echo "✅ 后端服务健康"
        break
    fi
    echo "⏳ 等待后端服务启动... ($((RETRY_COUNT + 1))/$MAX_RETRIES)"
    sleep 5
    RETRY_COUNT=$((RETRY_COUNT + 1))
done

if [ $RETRY_COUNT -eq $MAX_RETRIES ]; then
    echo "❌ 后端服务启动失败"
    echo "请检查日志: docker-compose logs app"
    exit 1
fi

if curl -s -I http://localhost:3000 | grep -q "200 OK"; then
    echo "✅ 前端服务健康"
else
    echo "❌ 前端服务启动失败"
    exit 1
fi

# 自动打开浏览器（可选）
if command -v open &> /dev/null; then
    echo "🌐 自动打开浏览器..."
    open http://localhost:3000
elif command -v xdg-open &> /dev/null; then
    echo "🌐 自动打开浏览器..."
    xdg-open http://localhost:3000
fi

# 显示部署结果
echo ""
echo "🎉 部署成功！"
echo "=================================================="
echo "📱 前端界面: http://localhost:3000"
echo "🔧 后端API:  http://localhost:3019"
echo "📊 健康检查: http://localhost:3019/api/health"
echo ""
echo "🔍 服务状态:"
docker-compose ps

echo ""
echo "📋 快速开始:"
echo "1. 浏览器已自动打开 http://localhost:3000"
echo "2. 添加Azure语音密钥开始使用"
echo "3. 查看系统日志: docker-compose logs -f"
echo ""
echo "🛑 停止服务: docker-compose down"
echo "🔄 重启服务: docker-compose restart"
echo ""
echo "✅ 系统已完全自动化部署完成！"
