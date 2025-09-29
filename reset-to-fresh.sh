#!/bin/bash

# Azure Speech Key Manager - 完全重置脚本
# 将系统恢复到初始状态，就像从未使用过Docker一样

set -e

echo "🔄 开始完全重置 Azure Speech Key Manager..."
echo "⚠️  警告：这将删除所有数据、配置和上传的文件！"
echo ""

# 确认操作
read -p "确定要继续吗？输入 'YES' 确认: " confirm
if [ "$confirm" != "YES" ]; then
    echo "❌ 操作已取消"
    exit 1
fi

echo ""
echo "🛑 步骤 1: 停止并删除所有容器..."
docker-compose down --volumes --remove-orphans 2>/dev/null || true

echo "🗑️  步骤 2: 删除所有相关的Docker资源..."
# 删除容器
docker rm -f $(docker ps -aq --filter "name=azure_speech_keymanager") 2>/dev/null || true

# 删除镜像
docker rmi -f $(docker images --filter "reference=azure_speech_keymanager*" -q) 2>/dev/null || true

# 删除卷
docker volume rm -f azure_speech_keymanager-main_mysql_azkm_data 2>/dev/null || true
docker volume rm -f azure_speech_keymanager-main_redis_azkm_data 2>/dev/null || true

# 删除网络
docker network rm azure_speech_keymanager-main_azkm_network 2>/dev/null || true

echo "🧹 步骤 3: 清理本地文件和目录..."
# 删除上传的文件
rm -rf ./uploads/* 2>/dev/null || true
rm -rf ./json/* 2>/dev/null || true
rm -rf ./credentials/* 2>/dev/null || true

# 删除日志文件
rm -rf ./logs/* 2>/dev/null || true

# 删除备份文件
rm -rf ./backups/* 2>/dev/null || true

# 删除临时文件
rm -rf ./dist 2>/dev/null || true
rm -rf ./frontend/.next 2>/dev/null || true
rm -rf ./frontend/out 2>/dev/null || true

# 删除测试文件
rm -f ./*test*.json 2>/dev/null || true

echo "🔧 步骤 4: 重置Docker构建缓存..."
docker builder prune -f 2>/dev/null || true

echo "📁 步骤 5: 重新创建必要的目录..."
mkdir -p ./uploads
mkdir -p ./json
mkdir -p ./credentials
mkdir -p ./logs
mkdir -p ./backups

# 创建.gitkeep文件保持目录结构
touch ./uploads/.gitkeep
touch ./json/.gitkeep
touch ./credentials/.gitkeep
touch ./logs/.gitkeep
touch ./backups/.gitkeep

echo "🎯 步骤 6: 验证清理结果..."
echo "   - Docker容器: $(docker ps -aq --filter "name=azure_speech_keymanager" | wc -l) 个"
echo "   - Docker镜像: $(docker images --filter "reference=azure_speech_keymanager*" -q | wc -l) 个"
echo "   - Docker卷: $(docker volume ls --filter "name=azure_speech_keymanager" -q | wc -l) 个"
echo "   - 上传文件: $(find ./uploads -type f 2>/dev/null | wc -l) 个"
echo "   - JSON配置: $(find ./json -type f 2>/dev/null | wc -l) 个"
echo "   - 日志文件: $(find ./logs -type f 2>/dev/null | wc -l) 个"

echo ""
echo "✅ 完全重置完成！"
echo ""
echo "🚀 现在你可以运行以下命令重新开始："
echo "   docker-compose up --build"
echo ""
echo "📋 系统将会："
echo "   - 重新构建所有镜像"
echo "   - 创建全新的数据库"
echo "   - 初始化所有表和数据"
echo "   - 启动全新的服务实例"
echo ""
echo "🎉 就像从未使用过Docker一样！"
