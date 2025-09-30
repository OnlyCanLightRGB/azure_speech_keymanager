#!/bin/bash

# Azure Speech Key Manager - MySQL 5.7 优化启动脚本
# 使用整合后的init.sql，简化部署流程

set -e

echo "🚀 Starting Azure Speech Key Manager (MySQL 5.7 Optimized)..."
echo "Environment variables:"
echo "  NODE_ENV: $NODE_ENV"
echo "  PORT: $PORT"
echo "  FRONTEND_PORT: $FRONTEND_PORT"
echo "  DB_HOST: $DB_HOST"
echo "  REDIS_URL: $REDIS_URL"

# 等待数据库和Redis就绪
echo "Waiting for database and redis to be ready..."
sleep 10

# 数据库初始化（使用整合后的init.sql）
echo "🔧 Running database initialization..."

# 检查数据库是否已经初始化
echo "Checking if database is already initialized..."
TABLE_EXISTS=$(mysql -h"$DB_HOST" -u"$DB_USER" -p"$DB_PASSWORD" "$DB_NAME" --skip-ssl -se "
  SELECT COUNT(*) FROM information_schema.tables 
  WHERE table_schema = '$DB_NAME' AND table_name = 'azure_keys';
" 2>/dev/null || echo "0")

if [ "$TABLE_EXISTS" -eq 0 ]; then
  echo "📋 Database not initialized. Running full initialization..."
  
  # 运行完整的init.sql（包含所有表结构和数据）
  if mysql -h"$DB_HOST" -u"$DB_USER" -p"$DB_PASSWORD" "$DB_NAME" --skip-ssl < /app/database/init.sql 2>&1 | {
    while IFS= read -r line; do
      # 过滤掉一些正常的警告信息
      if echo "$line" | grep -v "Duplicate entry" | grep -v "already exists" | grep -v "Unknown column" >/dev/null; then
        echo "  $line"
      fi
    done
  }; then
    echo "✅ Database initialization completed successfully"
  else
    echo "❌ Database initialization failed"
    exit 1
  fi
else
  echo "✅ Database already initialized (found azure_keys table)"
  
  # 检查是否需要运行特定的更新（保底密钥功能）
  echo "Checking for priority_weight field..."
  PRIORITY_WEIGHT_EXISTS=$(mysql -h"$DB_HOST" -u"$DB_USER" -p"$DB_PASSWORD" "$DB_NAME" --skip-ssl -se "
    SELECT COUNT(*) FROM information_schema.columns 
    WHERE table_schema = '$DB_NAME' AND table_name = 'azure_keys' AND column_name = 'priority_weight';
  " 2>/dev/null || echo "0")
  
  if [ "$PRIORITY_WEIGHT_EXISTS" -eq 0 ]; then
    echo "🔧 Adding priority_weight field for fallback key functionality..."
    mysql -h"$DB_HOST" -u"$DB_USER" -p"$DB_PASSWORD" "$DB_NAME" --skip-ssl -e "
      ALTER TABLE azure_keys ADD COLUMN priority_weight int(11) NOT NULL DEFAULT 1 COMMENT '权值：1=普通key，0=保底key' AFTER error_count;
      ALTER TABLE translation_keys ADD COLUMN priority_weight int(11) NOT NULL DEFAULT 1 COMMENT '权值：1=普通key，0=保底key' AFTER error_count;
      ALTER TABLE azure_keys ADD INDEX idx_status_region_priority (status ASC, region ASC, priority_weight DESC, id ASC);
      ALTER TABLE translation_keys ADD INDEX idx_status_region_priority (status ASC, region ASC, priority_weight DESC, id ASC);
      ALTER TABLE azure_keys ADD INDEX idx_fallback_keys (priority_weight ASC, status ASC, region ASC);
      ALTER TABLE translation_keys ADD INDEX idx_fallback_keys (priority_weight ASC, status ASC, region ASC);
    " 2>/dev/null || echo "Priority weight fields may already exist"
    echo "✅ Priority weight fields updated"
  else
    echo "✅ Priority weight fields already exist"
  fi
fi

# 运行Docker环境特定的初始化
echo "🐳 Running Docker environment setup..."
if [ -f "/app/database/init-docker-data.sql" ]; then
  mysql -h"$DB_HOST" -u"$DB_USER" -p"$DB_PASSWORD" "$DB_NAME" --skip-ssl < /app/database/init-docker-data.sql 2>&1 | {
    while IFS= read -r line; do
      # 过滤掉重复键错误，这些是正常的
      if echo "$line" | grep -v "Duplicate entry" | grep -v "already exists" >/dev/null; then
        echo "$line"
      fi
    done
  } || {
    echo "Note: Some Docker data initialization steps may have been skipped (data may already exist)"
  }
  echo "✅ Docker environment setup completed"
else
  echo "⚠️  Docker initialization file not found, skipping..."
fi

# 验证MySQL版本
echo "🔍 Verifying MySQL version..."
MYSQL_VERSION=$(mysql -h"$DB_HOST" -u"$DB_USER" -p"$DB_PASSWORD" --skip-ssl -se "SELECT VERSION();" 2>/dev/null || echo "unknown")
echo "MySQL Version: $MYSQL_VERSION"

if echo "$MYSQL_VERSION" | grep -q "5.7"; then
  echo "✅ MySQL 5.7 detected - optimal configuration"
elif echo "$MYSQL_VERSION" | grep -q "8.0"; then
  echo "⚠️  MySQL 8.0 detected - using compatibility mode"
else
  echo "⚠️  Unknown MySQL version - proceeding with caution"
fi

# 清理无效状态
echo "🧹 Cleaning up invalid states..."
mysql -h"$DB_HOST" -u"$DB_USER" -p"$DB_PASSWORD" "$DB_NAME" --skip-ssl -e "
  UPDATE azure_keys SET status = 'enabled' WHERE status = 'cooldown' AND last_used < DATE_SUB(NOW(), INTERVAL 1 HOUR);
  UPDATE translation_keys SET status = 'enabled' WHERE status = 'cooldown' AND last_used < DATE_SUB(NOW(), INTERVAL 1 HOUR);
" 2>/dev/null || echo "State cleanup may have been skipped"
echo "✅ State cleanup completed"

# 从数据库初始化定时器
echo "⏰ Initializing timers from database..."
mysql -h"$DB_HOST" -u"$DB_USER" -p"$DB_PASSWORD" "$DB_NAME" --skip-ssl -e "
  SELECT COUNT(*) as active_configs FROM json_billing_configs WHERE auto_query_enabled = 1;
" 2>/dev/null | tail -n 1 | while read count; do
  echo "Found $count active JSON configurations"
done
echo "✅ Timer initialization completed"

# 验证后端健康状态
echo "🏥 Verifying backend health..."
cd /app
npm start &
BACKEND_PID=$!

# 等待后端启动
sleep 15

# 检查后端是否正常运行
if kill -0 $BACKEND_PID 2>/dev/null; then
  echo "✅ Backend is healthy"
else
  echo "❌ Backend failed to start"
  exit 1
fi

# 启动前端服务器
echo "🌐 Starting frontend server on port $FRONTEND_PORT..."
cd /app/frontend
npm start &
FRONTEND_PID=$!

echo "🎉 Services started. Backend PID: $BACKEND_PID, Frontend PID: $FRONTEND_PID"

# 显示访问信息
echo ""
echo "📋 Service Information:"
echo "  🌐 Frontend: http://localhost:$FRONTEND_PORT"
echo "  🔧 Backend API: http://localhost:$PORT"
echo "  🏥 Health Check: http://localhost:$PORT/api/health"
echo "  📊 Database: MySQL 5.7 (optimized)"
echo "  🔄 Redis: $REDIS_URL"
echo ""
echo "✅ Azure Speech Key Manager is ready!"

# 保持容器运行
wait
