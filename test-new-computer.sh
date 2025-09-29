#!/bin/bash

# Azure Speech Key Manager - 新电脑部署测试脚本
# 模拟在全新电脑上部署和测试系统功能

set -e

echo "🖥️  模拟新电脑部署测试..."
echo "📋 这将测试系统在全新环境中的完整功能"
echo ""

# 步骤1：模拟新电脑环境（清理当前环境）
echo "🧹 步骤 1: 模拟新电脑环境（清理现有Docker资源）..."
echo "   停止现有服务..."
docker-compose down --volumes --remove-orphans 2>/dev/null || true

echo "   清理Docker镜像和卷..."
docker rmi -f $(docker images --filter "reference=azure_speech_keymanager*" -q) 2>/dev/null || true
docker volume rm -f azure_speech_keymanager-main_mysql_azkm_data 2>/dev/null || true
docker volume rm -f azure_speech_keymanager-main_redis_azkm_data 2>/dev/null || true

echo "   清理构建缓存..."
docker builder prune -f 2>/dev/null || true

echo "✅ 环境清理完成（模拟新电脑状态）"

# 步骤2：构建和启动（就像在新电脑上第一次运行）
echo ""
echo "🚀 步骤 2: 构建和启动服务（模拟新电脑首次部署）..."
echo "   运行: docker-compose up --build -d"
docker-compose up --build -d

# 步骤3：等待服务就绪
echo ""
echo "⏳ 步骤 3: 等待服务完全就绪..."
max_wait=180
wait_time=0

echo "   等待后端服务..."
while [ $wait_time -lt $max_wait ]; do
    if curl -s http://localhost:3019/api/health > /dev/null 2>&1; then
        echo "   ✅ 后端服务就绪 ($wait_time 秒)"
        break
    fi
    if [ $((wait_time % 10)) -eq 0 ]; then
        echo "   ⏳ 等待后端服务... ($wait_time/$max_wait 秒)"
    fi
    sleep 2
    wait_time=$((wait_time + 2))
done

if [ $wait_time -ge $max_wait ]; then
    echo "   ❌ 后端服务启动超时"
    echo "   📋 查看日志:"
    docker-compose logs app --tail=30
    exit 1
fi

echo "   等待前端服务..."
wait_time=0
while [ $wait_time -lt 60 ]; do
    if curl -s http://localhost:3000 > /dev/null 2>&1; then
        echo "   ✅ 前端服务就绪 ($wait_time 秒)"
        break
    fi
    sleep 2
    wait_time=$((wait_time + 2))
done

# 步骤4：功能测试
echo ""
echo "🔧 步骤 4: 完整功能测试..."

# 4.1 健康检查
echo "   4.1 测试系统健康状态..."
health_response=$(curl -s http://localhost:3019/api/health)
if echo "$health_response" | grep -q '"status":"healthy"'; then
    echo "       ✅ 系统健康检查通过"
    # 显示详细状态
    database_status=$(echo "$health_response" | jq -r '.data.database' 2>/dev/null)
    redis_status=$(echo "$health_response" | jq -r '.data.redis' 2>/dev/null)
    echo "       📊 数据库: $database_status, Redis: $redis_status"
else
    echo "       ❌ 系统健康检查失败"
    echo "       响应: $health_response"
    exit 1
fi

# 4.2 前端界面测试
echo "   4.2 测试前端界面..."
if curl -s http://localhost:3000 | grep -q "Azure 语音服务密钥管理器"; then
    echo "       ✅ 前端界面加载正常"
else
    echo "       ❌ 前端界面加载失败"
    exit 1
fi

# 4.3 API接口测试
echo "   4.3 测试API接口..."
configs_response=$(curl -s http://localhost:3000/api/billing-azure/json-configs)
if echo "$configs_response" | grep -q '"success":true'; then
    initial_count=$(echo "$configs_response" | jq -r '.data.configs | length' 2>/dev/null || echo "0")
    echo "       ✅ API接口正常 (初始配置数: $initial_count)"
else
    echo "       ❌ API接口测试失败"
    echo "       响应: $configs_response"
    exit 1
fi

# 4.4 文件上传功能测试
echo "   4.4 测试文件上传功能..."
cat > new-computer-test.json << EOF
{
  "appId": "new-computer-test-app",
  "tenant": "new-computer-test-tenant",
  "displayName": "New Computer Test",
  "password": "new-computer-test-password"
}
EOF

upload_response=$(curl -s -X POST "http://localhost:3000/api/billing-azure/upload-json-config" \
  -F "jsonFile=@new-computer-test.json" \
  -F "configName=New Computer Test Config" \
  -F "queryIntervalMinutes=30" \
  -F "autoQueryEnabled=true")

if echo "$upload_response" | grep -q '"success":true'; then
    config_id=$(echo "$upload_response" | jq -r '.configId' 2>/dev/null)
    echo "       ✅ 文件上传功能正常 (配置ID: $config_id)"
else
    echo "       ❌ 文件上传功能失败"
    echo "       响应: $upload_response"
    rm -f new-computer-test.json
    exit 1
fi

# 4.5 配置保存和定时器测试
echo "   4.5 测试配置保存和定时器..."
sleep 3
configs_response=$(curl -s http://localhost:3000/api/billing-azure/json-configs)
final_count=$(echo "$configs_response" | jq -r '.data.configs | length' 2>/dev/null || echo "0")
next_query_time=$(echo "$configs_response" | jq -r '.data.configs[] | select(.configName == "New Computer Test Config") | .nextQueryTime' 2>/dev/null)

if [ "$final_count" -gt "$initial_count" ] && [ "$next_query_time" != "null" ] && [ "$next_query_time" != "" ]; then
    echo "       ✅ 配置保存和定时器正常"
    echo "       📊 配置数量: $initial_count → $final_count"
    echo "       ⏰ 下次查询时间: $next_query_time"
else
    echo "       ❌ 配置保存或定时器失败"
    echo "       配置数量: $final_count, 定时器: $next_query_time"
    exit 1
fi

# 4.6 定时器恢复测试（重启容器）
echo "   4.6 测试Docker重启后的状态恢复..."
echo "       重启应用容器..."
docker-compose restart app

echo "       等待服务重新就绪..."
wait_time=0
while [ $wait_time -lt 60 ]; do
    if curl -s http://localhost:3019/api/health > /dev/null 2>&1; then
        echo "       ✅ 重启后服务就绪 ($wait_time 秒)"
        break
    fi
    sleep 2
    wait_time=$((wait_time + 2))
done

if [ $wait_time -ge 60 ]; then
    echo "       ❌ 重启后服务启动超时"
    exit 1
fi

# 验证重启后状态
sleep 5
configs_after_restart=$(curl -s http://localhost:3000/api/billing-azure/json-configs)
count_after_restart=$(echo "$configs_after_restart" | jq -r '.data.configs | length' 2>/dev/null || echo "0")
timer_after_restart=$(echo "$configs_after_restart" | jq -r '.data.configs[] | select(.configName == "New Computer Test Config") | .nextQueryTime' 2>/dev/null)

if [ "$count_after_restart" -eq "$final_count" ] && [ "$timer_after_restart" != "null" ]; then
    echo "       ✅ 重启后状态恢复正常"
    echo "       📊 配置保持: $count_after_restart, 定时器恢复: ✓"
else
    echo "       ❌ 重启后状态恢复失败"
    exit 1
fi

# 清理测试文件
rm -f new-computer-test.json

# 步骤5：性能和稳定性检查
echo ""
echo "📊 步骤 5: 系统状态检查..."
echo "   容器状态:"
docker-compose ps

echo ""
echo "   资源使用:"
docker stats --no-stream --format "table {{.Container}}\t{{.CPUPerc}}\t{{.MemUsage}}" $(docker-compose ps -q)

echo ""
echo "   日志检查 (最近10行):"
docker-compose logs app --tail=10

# 最终结果
echo ""
echo "🎉 新电脑部署测试完成！"
echo ""
echo "✅ 测试结果总结:"
echo "   ✓ Docker构建和启动"
echo "   ✓ 服务健康检查"
echo "   ✓ 前端界面加载"
echo "   ✓ API接口功能"
echo "   ✓ 文件上传功能"
echo "   ✓ 配置保存功能"
echo "   ✓ 定时器创建"
echo "   ✓ 容器重启恢复"
echo "   ✓ 状态持久化"
echo ""
echo "🌐 访问地址:"
echo "   前端: http://localhost:3000"
echo "   后端: http://localhost:3019"
echo "   健康检查: http://localhost:3019/api/health"
echo ""
echo "🎯 结论: 系统可以在新电脑上完全正常工作！"
echo "💡 新用户只需运行: docker-compose up --build"
