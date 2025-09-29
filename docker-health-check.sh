#!/bin/bash

# Docker健康检查脚本
# 用于验证容器内的服务是否正常运行

set -e

echo "🔍 Docker健康检查开始..."

# 检查环境变量
echo "📋 检查环境变量:"
echo "  NODE_ENV: ${NODE_ENV:-未设置}"
echo "  PORT: ${PORT:-未设置}"
echo "  FRONTEND_PORT: ${FRONTEND_PORT:-未设置}"
echo "  DB_HOST: ${DB_HOST:-未设置}"
echo "  REDIS_URL: ${REDIS_URL:-未设置}"

# 检查后端服务
BACKEND_PORT=${PORT:-3019}
echo "🔧 检查后端服务 (端口 $BACKEND_PORT)..."

if wget --no-verbose --tries=3 --timeout=10 --spider "http://localhost:$BACKEND_PORT/api/health" 2>/dev/null; then
    echo "✅ 后端服务正常"
    
    # 获取健康检查详情
    HEALTH_RESPONSE=$(wget -qO- "http://localhost:$BACKEND_PORT/api/health" 2>/dev/null || echo "无法获取详情")
    echo "📊 健康检查响应: $HEALTH_RESPONSE"
else
    echo "❌ 后端服务无响应"
    exit 1
fi

# 检查前端服务
FRONTEND_PORT=${FRONTEND_PORT:-3000}
echo "🎨 检查前端服务 (端口 $FRONTEND_PORT)..."

if wget --no-verbose --tries=3 --timeout=10 --spider "http://localhost:$FRONTEND_PORT" 2>/dev/null; then
    echo "✅ 前端服务正常"
else
    echo "❌ 前端服务无响应"
    exit 1
fi

# 检查进程
echo "🔍 检查运行进程:"
ps aux | grep -E "(node|npm)" | grep -v grep || echo "未找到Node.js进程"

# 检查端口监听
echo "🔌 检查端口监听:"
netstat -tlnp 2>/dev/null | grep -E ":($BACKEND_PORT|$FRONTEND_PORT)" || echo "未找到监听端口"

echo "✅ Docker健康检查完成"
