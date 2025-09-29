#!/bin/bash

# Azure Speech Key Manager - 全新启动测试脚本
# 测试从初始状态启动的完整流程

set -e

echo "🧪 开始全新启动测试..."
echo ""

# 检查初始状态
echo "🔍 步骤 1: 验证初始状态..."
if ! ./verify-fresh-state.sh > /dev/null 2>&1; then
    echo "❌ 系统不在初始状态，请先运行重置脚本"
    echo "💡 运行: ./reset-to-fresh.sh"
    exit 1
fi
echo "✅ 初始状态验证通过"

# 启动服务
echo ""
echo "🚀 步骤 2: 启动服务..."
echo "   正在构建和启动容器..."
docker-compose up --build -d

# 等待服务就绪
echo ""
echo "⏳ 步骤 3: 等待服务就绪..."
max_wait=120
wait_time=0
while [ $wait_time -lt $max_wait ]; do
    if curl -s http://localhost:3019/api/health > /dev/null 2>&1; then
        echo "✅ 后端服务就绪"
        break
    fi
    echo "   等待后端服务... ($wait_time/$max_wait 秒)"
    sleep 5
    wait_time=$((wait_time + 5))
done

if [ $wait_time -ge $max_wait ]; then
    echo "❌ 服务启动超时"
    docker-compose logs app --tail=20
    exit 1
fi

# 等待前端就绪
wait_time=0
while [ $wait_time -lt 60 ]; do
    if curl -s http://localhost:3000 > /dev/null 2>&1; then
        echo "✅ 前端服务就绪"
        break
    fi
    echo "   等待前端服务... ($wait_time/60 秒)"
    sleep 3
    wait_time=$((wait_time + 3))
done

# 测试基本功能
echo ""
echo "🔧 步骤 4: 测试基本功能..."

# 测试健康检查
echo "   测试健康检查..."
health_response=$(curl -s http://localhost:3019/api/health)
if echo "$health_response" | grep -q '"status":"healthy"'; then
    echo "   ✅ 健康检查通过"
else
    echo "   ❌ 健康检查失败"
    echo "   响应: $health_response"
    exit 1
fi

# 测试配置列表（应该为空）
echo "   测试配置列表..."
configs_response=$(curl -s http://localhost:3000/api/billing-azure/json-configs)
if echo "$configs_response" | grep -q '"success":true'; then
    config_count=$(echo "$configs_response" | jq -r '.data.configs | length' 2>/dev/null || echo "0")
    echo "   ✅ 配置列表获取成功 (配置数量: $config_count)"
else
    echo "   ❌ 配置列表获取失败"
    echo "   响应: $configs_response"
    exit 1
fi

# 测试前端页面
echo "   测试前端页面..."
if curl -s http://localhost:3000 | grep -q "Azure 语音服务密钥管理器"; then
    echo "   ✅ 前端页面加载成功"
else
    echo "   ❌ 前端页面加载失败"
    exit 1
fi

# 创建测试配置文件
echo ""
echo "📝 步骤 5: 测试文件上传功能..."
cat > fresh-test-config.json << EOF
{
  "appId": "fresh-test-app-id",
  "tenant": "fresh-test-tenant",
  "displayName": "Fresh Test Config",
  "password": "fresh-test-password-123"
}
EOF

# 测试文件上传
echo "   上传测试配置..."
upload_response=$(curl -s -X POST "http://localhost:3000/api/billing-azure/upload-json-config" \
  -F "jsonFile=@fresh-test-config.json" \
  -F "configName=Fresh Test Config" \
  -F "queryIntervalMinutes=60" \
  -F "autoQueryEnabled=true")

if echo "$upload_response" | grep -q '"success":true'; then
    echo "   ✅ 文件上传成功"
    config_id=$(echo "$upload_response" | jq -r '.configId' 2>/dev/null)
    echo "   配置ID: $config_id"
else
    echo "   ❌ 文件上传失败"
    echo "   响应: $upload_response"
    exit 1
fi

# 验证配置保存
echo "   验证配置保存..."
sleep 2
configs_response=$(curl -s http://localhost:3000/api/billing-azure/json-configs)
config_count=$(echo "$configs_response" | jq -r '.data.configs | length' 2>/dev/null || echo "0")
if [ "$config_count" -gt 0 ]; then
    echo "   ✅ 配置保存验证成功 (配置数量: $config_count)"
    
    # 检查nextQueryTime
    next_query_time=$(echo "$configs_response" | jq -r '.data.configs[0].nextQueryTime' 2>/dev/null)
    if [ "$next_query_time" != "null" ] && [ "$next_query_time" != "" ]; then
        echo "   ✅ 定时器设置成功 (下次查询: $next_query_time)"
    else
        echo "   ❌ 定时器设置失败"
        exit 1
    fi
else
    echo "   ❌ 配置保存验证失败"
    exit 1
fi

# 清理测试文件
rm -f fresh-test-config.json

# 显示服务状态
echo ""
echo "📊 步骤 6: 服务状态总结..."
docker-compose ps

echo ""
echo "🎉 全新启动测试完成！"
echo ""
echo "✅ 测试结果:"
echo "   - 服务启动: 成功"
echo "   - 健康检查: 通过"
echo "   - 前端加载: 正常"
echo "   - 文件上传: 正常"
echo "   - 配置保存: 正常"
echo "   - 定时器创建: 正常"
echo ""
echo "🌐 访问地址:"
echo "   - 前端界面: http://localhost:3000"
echo "   - 后端API: http://localhost:3019"
echo "   - 健康检查: http://localhost:3019/api/health"
echo ""
echo "🎯 系统已完全就绪，可以正常使用！"
