#!/bin/bash

# Azure Speech Key Manager 部署脚本
# 绕过Docker问题，直接使用Node.js运行

echo "开始部署 Azure Speech Key Manager..."

# 检查Node.js版本
echo "检查Node.js版本..."
node --version
npm --version

# 安装依赖
echo "安装根目录依赖..."
npm install

echo "安装前端依赖..."
cd frontend
npm install
cd ..

# 构建项目
echo "构建项目..."
npm run build

# 创建生产环境配置
echo "创建生产环境配置..."
if [ ! -f .env ]; then
    cp .env.example .env
    echo "请编辑 .env 文件配置数据库和其他环境变量"
fi

# 创建启动脚本
cat > start-production.sh << 'EOF'
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
EOF

chmod +x start-production.sh

echo "部署完成！"
echo "使用以下命令启动生产环境:"
echo "  ./start-production.sh"
echo ""
echo "注意事项:"
echo "1. 请确保已配置 .env 文件中的数据库连接"
echo "2. 请确保MySQL和Redis服务正在运行"
echo "3. 如需使用Docker，请先解决Docker API版本问题"