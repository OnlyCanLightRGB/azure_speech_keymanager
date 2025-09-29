#!/bin/bash

# Azure Speech Key Manager - 验证初始状态脚本
# 验证系统是否处于全新的初始状态

set -e

echo "🔍 验证 Azure Speech Key Manager 初始状态..."
echo ""

# 检查Docker资源
echo "📦 检查Docker资源..."
containers=$(docker ps -aq --filter "name=azure_speech_keymanager" | wc -l)
images=$(docker images --filter "reference=azure_speech_keymanager*" -q | wc -l)
volumes=$(docker volume ls --filter "name=azure_speech_keymanager" -q | wc -l)

echo "   - 运行中的容器: $(docker ps -q --filter "name=azure_speech_keymanager" | wc -l)"
echo "   - 所有容器: $containers"
echo "   - 相关镜像: $images"
echo "   - 数据卷: $volumes"

# 检查本地文件
echo ""
echo "📁 检查本地文件..."
uploads_count=$(find ./uploads -type f 2>/dev/null | grep -v ".gitkeep" | wc -l || echo "0")
json_count=$(find ./json -type f 2>/dev/null | grep -v ".gitkeep" | wc -l || echo "0")
logs_count=$(find ./logs -type f 2>/dev/null | grep -v ".gitkeep" | wc -l || echo "0")
backups_count=$(find ./backups -type f 2>/dev/null | grep -v ".gitkeep" | wc -l || echo "0")
credentials_count=$(find ./credentials -type f 2>/dev/null | grep -v ".gitkeep" | wc -l || echo "0")

echo "   - 上传文件: $uploads_count 个"
echo "   - JSON配置: $json_count 个"
echo "   - 日志文件: $logs_count 个"
echo "   - 备份文件: $backups_count 个"
echo "   - 凭证文件: $credentials_count 个"

# 检查构建文件
echo ""
echo "🔨 检查构建文件..."
dist_exists=$([ -d "./dist" ] && echo "存在" || echo "不存在")
next_exists=$([ -d "./frontend/.next" ] && echo "存在" || echo "不存在")
out_exists=$([ -d "./frontend/out" ] && echo "存在" || echo "不存在")

echo "   - 后端构建目录 (dist): $dist_exists"
echo "   - 前端构建目录 (.next): $next_exists"
echo "   - 前端输出目录 (out): $out_exists"

# 检查测试文件
echo ""
echo "🧪 检查测试文件..."
test_files=$(find . -maxdepth 1 -name "*test*.json" 2>/dev/null | wc -l)
echo "   - 测试JSON文件: $test_files 个"

# 总结状态
echo ""
echo "📊 状态总结:"

fresh_state=true

if [ $containers -gt 0 ]; then
    echo "   ❌ 存在旧容器"
    fresh_state=false
fi

if [ $images -gt 0 ]; then
    echo "   ❌ 存在旧镜像"
    fresh_state=false
fi

if [ $volumes -gt 0 ]; then
    echo "   ❌ 存在数据卷"
    fresh_state=false
fi

if [ $uploads_count -gt 0 ] || [ $json_count -gt 0 ] || [ $logs_count -gt 0 ] || [ $backups_count -gt 0 ] || [ $credentials_count -gt 0 ]; then
    echo "   ❌ 存在用户数据文件"
    fresh_state=false
fi

if [ "$dist_exists" = "存在" ] || [ "$next_exists" = "存在" ] || [ "$out_exists" = "存在" ]; then
    echo "   ❌ 存在构建文件"
    fresh_state=false
fi

if [ $test_files -gt 0 ]; then
    echo "   ❌ 存在测试文件"
    fresh_state=false
fi

echo ""
if [ "$fresh_state" = true ]; then
    echo "✅ 系统处于完全初始状态！"
    echo "🎉 就像从未使用过Docker一样！"
    echo ""
    echo "🚀 可以安全地运行："
    echo "   docker-compose up --build"
    exit 0
else
    echo "❌ 系统不在初始状态"
    echo "💡 建议运行重置脚本："
    echo "   ./reset-to-fresh.sh"
    exit 1
fi
