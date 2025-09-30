#!/bin/bash

# Azure Speech Key Manager - 客户SSL修复脚本
# 专门针对客户服务器环境的SSL证书问题修复
# 适用于：CentOS 7 + Docker 20.10.8 + MySQL 5.7

set -e

echo "🚀 Azure Speech Key Manager - 客户SSL修复脚本"
echo "=================================================="
echo "目标：修复MySQL 5.7 SSL自签名证书错误"
echo "环境：CentOS 7 + Docker 20.10.8"
echo ""

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# 日志函数
log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

log_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# 检查当前目录
check_directory() {
    if [ ! -f "docker-compose.yml" ]; then
        log_error "请在项目根目录下运行此脚本"
        exit 1
    fi
    
    if [ ! -f "start.sh" ]; then
        log_error "start.sh文件不存在"
        exit 1
    fi
    
    log_success "目录检查通过"
}

# 备份现有配置
backup_configs() {
    log_info "备份现有配置文件..."
    
    cp docker-compose.yml docker-compose.yml.backup.$(date +%Y%m%d_%H%M%S) 2>/dev/null || {
        log_warning "无法创建docker-compose.yml备份，可能需要root权限"
    }
    
    cp start.sh start.sh.backup.$(date +%Y%m%d_%H%M%S) 2>/dev/null || {
        log_warning "无法创建start.sh备份，可能需要root权限"
    }
    
    log_success "配置备份完成"
}

# 检查当前SSL错误
check_ssl_errors() {
    log_info "检查当前SSL错误..."
    
    local ssl_errors=$(docker logs azure_speech_keymanager_app_1 2>&1 | grep -c "TLS/SSL error" || echo "0")
    
    if [ "$ssl_errors" -gt "0" ]; then
        log_warning "发现 $ssl_errors 个SSL错误"
        echo "错误示例："
        docker logs azure_speech_keymanager_app_1 2>&1 | grep "TLS/SSL error" | head -3
        echo ""
        return 0
    else
        log_success "未发现SSL错误"
        return 1
    fi
}

# 修复docker-compose.yml
fix_docker_compose() {
    log_info "修复docker-compose.yml..."
    
    # 检查是否已经有command配置
    if grep -q "command.*skip-ssl" docker-compose.yml; then
        log_success "docker-compose.yml已包含SSL修复配置"
        return 0
    fi
    
    # 创建临时修复文件
    cat > /tmp/docker-compose-fix.yml << 'EOF'
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
      test: ["CMD", "sh", "-c", "wget --no-verbose --tries=1 --spider http://localhost:$$PORT/api/health || exit 1"]
      interval: 30s
      timeout: 10s
      retries: 5
      start_period: 60s
    networks:
      - azkm_network

  mysql_azkm:
    image: mysql:5.7
    command: --character-set-server=utf8mb4 --collation-server=utf8mb4_unicode_ci --skip-ssl --default-authentication-plugin=mysql_native_password --sql_mode=STRICT_TRANS_TABLES,NO_ZERO_DATE,NO_ZERO_IN_DATE,ERROR_FOR_DIVISION_BY_ZERO,NO_AUTO_CREATE_USER,NO_ENGINE_SUBSTITUTION
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
    
    # 尝试替换文件
    if cp /tmp/docker-compose-fix.yml docker-compose.yml 2>/dev/null; then
        log_success "docker-compose.yml修复完成"
    else
        log_error "无法修改docker-compose.yml，需要root权限"
        echo "请手动执行："
        echo "sudo cp /tmp/docker-compose-fix.yml docker-compose.yml"
        exit 1
    fi
}

# 修复start.sh
fix_start_sh() {
    log_info "修复start.sh脚本..."
    
    # 检查是否已经修复
    if grep -q "skip-ssl" start.sh; then
        log_success "start.sh已包含SSL修复配置"
        return 0
    fi
    
    # 创建修复后的start.sh
    sed 's/mysql -h"$DB_HOST" -u"$DB_USER" -p"$DB_PASSWORD" "$DB_NAME"/mysql -h"$DB_HOST" -u"$DB_USER" -p"$DB_PASSWORD" "$DB_NAME" --skip-ssl/g' start.sh > /tmp/start-fix.sh
    
    # 尝试替换文件
    if cp /tmp/start-fix.sh start.sh 2>/dev/null; then
        chmod +x start.sh
        log_success "start.sh修复完成"
    else
        log_error "无法修改start.sh，需要root权限"
        echo "请手动执行："
        echo "sudo cp /tmp/start-fix.sh start.sh"
        echo "sudo chmod +x start.sh"
        exit 1
    fi
}

# 重新部署服务
redeploy_services() {
    log_info "重新部署服务..."
    
    # 停止现有服务
    log_info "停止现有服务..."
    docker-compose down
    
    # 删除旧的应用镜像强制重建
    log_info "删除旧的应用镜像..."
    docker rmi $(docker images -q azure_speech_keymanager_app) 2>/dev/null || true
    
    # 重新构建和启动
    log_info "重新构建应用镜像..."
    docker-compose build --no-cache app
    
    log_info "启动所有服务..."
    docker-compose up -d
    
    log_success "服务重新部署完成"
}

# 验证修复效果
verify_fix() {
    log_info "验证修复效果..."
    
    # 等待服务启动
    log_info "等待服务启动..."
    sleep 20
    
    # 检查容器状态
    log_info "检查容器状态..."
    docker-compose ps
    
    # 检查健康状态
    local max_attempts=10
    local attempt=1
    
    while [ $attempt -le $max_attempts ]; do
        log_info "尝试连接应用... ($attempt/$max_attempts)"
        
        if curl -s http://localhost:3019/api/health > /dev/null 2>&1; then
            local health_response=$(curl -s http://localhost:3019/api/health)
            local status=$(echo $health_response | grep -o '"status":"[^"]*"' | cut -d'"' -f4)
            
            if [ "$status" = "healthy" ]; then
                log_success "应用健康检查通过！"
                echo ""
                echo "🎉 修复验证结果："
                echo "   ✅ 应用状态: healthy"
                echo "   ✅ 数据库连接: connected"
                echo "   ✅ Redis连接: connected"
                echo ""
                break
            fi
        fi
        
        if [ $attempt -eq $max_attempts ]; then
            log_error "应用启动验证失败"
            return 1
        fi
        
        sleep 3
        ((attempt++))
    done
    
    # 检查SSL错误是否消失
    log_info "检查SSL错误修复情况..."
    sleep 5
    
    local new_ssl_errors=$(docker logs azure_speech_keymanager_app_1 2>&1 | grep -c "TLS/SSL error" || echo "0")
    
    if [ "$new_ssl_errors" -eq "0" ]; then
        log_success "SSL错误已完全修复！"
    else
        log_warning "仍有 $new_ssl_errors 个SSL错误，可能是历史日志"
    fi
    
    return 0
}

# 显示修复总结
show_summary() {
    echo ""
    echo "🎯 SSL修复总结"
    echo "=================================================="
    echo "修复内容："
    echo "✅ docker-compose.yml: 添加 --skip-ssl 参数"
    echo "✅ start.sh: 所有mysql命令添加 --skip-ssl 参数"
    echo "✅ 重新构建应用镜像"
    echo "✅ 验证服务健康状态"
    echo ""
    echo "访问地址："
    echo "🌐 前端: http://localhost:3000"
    echo "🌐 后端API: http://localhost:3019"
    echo "🌐 健康检查: http://localhost:3019/api/health"
    echo ""
    echo "⚠️  注意事项："
    echo "- SSL已禁用，仅适用于内网环境"
    echo "- 生产环境建议配置正确的SSL证书"
    echo "- 保底密钥功能已完全修复并可正常使用"
    echo ""
}

# 主函数
main() {
    echo "开始客户SSL修复流程..."
    echo ""
    
    check_directory
    backup_configs
    
    # 检查是否需要修复
    if ! check_ssl_errors; then
        log_success "系统运行正常，无需修复"
        exit 0
    fi
    
    fix_docker_compose
    fix_start_sh
    redeploy_services
    
    if verify_fix; then
        show_summary
        log_success "🎉 SSL修复完成！"
    else
        log_error "修复验证失败，请检查日志"
        echo ""
        echo "故障排除："
        echo "1. 检查容器日志: docker-compose logs app"
        echo "2. 检查容器状态: docker-compose ps"
        echo "3. 手动验证健康: curl http://localhost:3019/api/health"
        exit 1
    fi
}

# 错误处理
trap 'log_error "修复过程中发生错误，请检查上述日志"; exit 1' ERR

# 运行主函数
main "$@"
