#!/bin/bash
echo "启动 Azure Speech Key Manager 生产环境..."

# 设置环境变量
export NODE_ENV=production
export PORT=3000

# 启动应用
echo "启动后端服务..."
node dist/server.js &
BACKEND_PID=$!

echo "启动前端服务..."
cd frontend
npm start &
FRONTEND_PID=$!

echo "应用已启动:"
echo "- 后端服务: http://localhost:3000"
echo "- 前端服务: http://localhost:3001"
echo "- 后端进程ID: $BACKEND_PID"
echo "- 前端进程ID: $FRONTEND_PID"

echo "按 Ctrl+C 停止服务"

# 等待信号
trap 'echo "正在停止服务..."; kill $BACKEND_PID $FRONTEND_PID; exit' INT TERM
wait
