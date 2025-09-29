#!/bin/bash

# 修复Docker部署问题的脚本

set -e

echo "🔧 修复Docker部署问题..."

echo "1. 创建缺失的.env.docker文件..."
if [ ! -f ".env.docker" ]; then
    cp .env.docker .env.docker.backup 2>/dev/null || true
    cat > .env.docker << 'EOF'
# Docker环境配置文件
# 这个文件包含Docker容器运行时的环境变量

# 应用配置
NODE_ENV=production
PORT=3019
BACKEND_PORT=3019
FRONTEND_PORT=3000
DOCKER_ENV=true

# 数据库配置
DB_HOST=mysql_azkm
DB_PORT=3306
DB_USER=azure_speech_keymanager
DB_PASSWORD=azure_speech_keymanager
DB_NAME=azure_speech_keymanager

# Redis配置
REDIS_URL=redis://redis_azkm:6379

# API配置 - 浏览器访问后端API的URL
NEXT_PUBLIC_API_URL=http://localhost:3019

# 日志配置
LOG_LEVEL=info

# Azure配置（如果需要）
# AZURE_CLIENT_ID=
# AZURE_CLIENT_SECRET=
# AZURE_TENANT_ID=
# AZURE_SUBSCRIPTION_ID=

# Feishu配置（如果需要）
# FEISHU_WEBHOOK_URL=
# TRANSLATION_FEISHU_WEBHOOK_URL=
EOF
    echo "✅ .env.docker文件已创建"
else
    echo "✅ .env.docker文件已存在"
fi

echo "2. 清理重复的数据库迁移文件..."
cd database/migrations

# 重命名重复的迁移文件
if [ -f "002_add_example_field.sql" ]; then
    mv "002_add_example_field.sql" "002_add_example_field.sql.disabled"
    echo "✅ 禁用了重复的002_add_example_field.sql"
fi

if [ -f "002_fix_json_billing_history_table.sql" ]; then
    mv "002_fix_json_billing_history_table.sql" "004_fix_json_billing_history_table.sql"
    echo "✅ 重命名002_fix_json_billing_history_table.sql为004_fix_json_billing_history_table.sql"
fi

cd ../..

echo "3. 修复Dockerfile中的镜像源问题..."
# 创建一个更通用的Dockerfile
cp Dockerfile Dockerfile.backup
sed -i.bak 's|echo "https://mirrors.aliyun.com/alpine/v3.21/main" > /etc/apk/repositories.*|apk update|g' Dockerfile
sed -i.bak 's|echo "https://mirrors.aliyun.com/alpine/v3.21/community" >> /etc/apk/repositories.*||g' Dockerfile

echo "4. 修复docker-compose.yml中的健康检查..."
cp docker-compose.yml docker-compose.yml.backup
cat > docker-compose.yml << 'EOF'
services:
  app:
    build: .
    ports:
      - "0.0.0.0:3000:3000"
      - "0.0.0.0:3019:3019"
    env_file:
      - .env.docker
    environment:
      # 覆盖.env.docker中的特定配置
      - NEXT_PUBLIC_API_URL=${NEXT_PUBLIC_API_URL:-}
    depends_on:
      mysql_azkm:
        condition: service_healthy
      redis_azkm:
        condition: service_healthy
    volumes:
      - ./logs:/app/logs
      - ./uploads:/app/uploads
      - ./backups:/app/backups
    restart: unless-stopped
    healthcheck:
      test: ["CMD", "sh", "-c", "wget --no-verbose --tries=1 --spider http://localhost:3019/api/health || exit 1"]
      interval: 30s
      timeout: 10s
      retries: 5
      start_period: 60s
    networks:
      - azkm_network

  mysql_azkm:
    image: mysql:8.0
    environment:
      - MYSQL_ROOT_PASSWORD=rootpassword
      - MYSQL_DATABASE=azure_speech_keymanager
      - MYSQL_USER=azure_speech_keymanager
      - MYSQL_PASSWORD=azure_speech_keymanager
    volumes:
      - mysql_azkm_data:/var/lib/mysql
      - ./database/init.sql:/docker-entrypoint-initdb.d/init.sql
    restart: unless-stopped
    healthcheck:
      test: ["CMD", "mysqladmin", "ping", "-h", "localhost", "-u", "azure_speech_keymanager", "-pazure_speech_keymanager"]
      interval: 10s
      timeout: 5s
      retries: 5
      start_period: 30s
    networks:
      - azkm_network

  redis_azkm:
    image: redis:7-alpine
    volumes:
      - redis_azkm_data:/data
    restart: unless-stopped
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 10s
      timeout: 5s
      retries: 5
      start_period: 10s
    networks:
      - azkm_network

networks:
  azkm_network:
    driver: bridge

volumes:
  mysql_azkm_data:
  redis_azkm_data:
EOF

echo "5. 创建更健壮的Dockerfile..."
cat > Dockerfile << 'EOF'
# Multi-stage build for production
FROM node:18-alpine AS base

# Install dependencies only when needed
FROM base AS deps
RUN apk add --no-cache libc6-compat
# Set locale and encoding for proper UTF-8 support
ENV LANG=C.UTF-8 LC_ALL=C.UTF-8
WORKDIR /app

# Install root dependencies
COPY package*.json ./
RUN npm ci && npm cache clean --force

# Install frontend dependencies
COPY frontend/package*.json ./frontend/
RUN cd frontend && npm ci && npm cache clean --force

# Rebuild the source code only when needed
FROM base AS builder
# Set locale and encoding for proper UTF-8 support
ENV LANG=C.UTF-8 LC_ALL=C.UTF-8
# Increase Node.js memory limit for build
ENV NODE_OPTIONS="--max-old-space-size=4096"
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/frontend/node_modules ./frontend/node_modules
COPY . .

# Build backend
RUN npm run build:backend

# Build frontend with better error handling and environment variables
RUN cd frontend && \
    PORT=3000 \
    BACKEND_PORT=3019 \
    DOCKER_ENV=true \
    NODE_ENV=production \
    NEXT_PUBLIC_API_URL="http://localhost:3019" \
    npm run build

# Production image, copy all the files and run the app
FROM base AS runner
WORKDIR /app

ENV NODE_ENV=production

# Install system dependencies with fallback mirrors
RUN apk update && \
    apk add --no-cache wget python3 py3-requests mysql-client || \
    (echo "Trying alternative mirrors..." && \
     echo "https://dl-cdn.alpinelinux.org/alpine/v3.18/main" > /etc/apk/repositories && \
     echo "https://dl-cdn.alpinelinux.org/alpine/v3.18/community" >> /etc/apk/repositories && \
     apk update && \
     apk add --no-cache wget python3 py3-requests mysql-client)

# Create a symbolic link for python3 to ensure it's in PATH
RUN ln -sf /usr/bin/python3 /usr/local/bin/python3

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

# Copy production dependencies from builder stage
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/frontend/node_modules ./frontend/node_modules

# Copy package.json files for reference
COPY package*.json ./
COPY frontend/package*.json ./frontend/

# Copy built application
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/frontend/.next ./frontend/.next
COPY --from=builder /app/frontend/public ./frontend/public
COPY --from=builder /app/database ./database

# Copy Python scripts for Azure billing
COPY az.py /app/az.py
RUN chmod +x /app/az.py && chown nextjs:nodejs /app/az.py

# Copy startup and health check scripts
COPY start.sh /app/start.sh
COPY docker-health-check.sh /app/docker-health-check.sh
RUN chmod +x /app/start.sh /app/docker-health-check.sh && \
    chown nextjs:nodejs /app/start.sh /app/docker-health-check.sh

# Create logs, backups, uploads, json, and credentials directories with proper permissions
RUN mkdir -p /app/logs /app/backups /app/uploads /app/json /app/credentials && \
    chown -R nextjs:nodejs /app/logs /app/backups /app/uploads /app/json /app/credentials && \
    chmod -R 755 /app/uploads /app/json /app/credentials

USER nextjs

EXPOSE 3019
EXPOSE 3000

ENV PORT=3019

CMD ["/app/start.sh"]
EOF

echo "✅ 所有问题已修复！"
echo ""
echo "📋 修复内容："
echo "  1. ✅ 创建了.env.docker文件"
echo "  2. ✅ 清理了重复的数据库迁移文件"
echo "  3. ✅ 修复了Dockerfile中的镜像源问题"
echo "  4. ✅ 修复了docker-compose.yml中的健康检查"
echo "  5. ✅ 创建了更健壮的Dockerfile"
echo ""
echo "🎯 现在可以安全地在新电脑上运行："
echo "  docker-compose up --build"
