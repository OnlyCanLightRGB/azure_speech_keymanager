#!/bin/bash

# Azure Speech Key Manager - SSL修复部署脚本
# 解决MySQL 8.0 SSL证书问题
# 适用于客户环境部署

set -e

echo "🚀 Azure Speech Key Manager - SSL修复部署脚本"
echo "=================================================="
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

# 检查Docker环境
check_docker() {
    log_info "检查Docker环境..."
    
    if ! command -v docker &> /dev/null; then
        log_error "Docker未安装，请先安装Docker"
        exit 1
    fi
    
    if ! command -v docker-compose &> /dev/null; then
        log_error "Docker Compose未安装，请先安装Docker Compose"
        exit 1
    fi
    
    # 检查Docker是否运行
    if ! docker info &> /dev/null; then
        log_error "Docker服务未运行，请启动Docker服务"
        exit 1
    fi
    
    log_success "Docker环境检查通过"
    docker --version
    docker-compose --version
    echo ""
}

# 清理Docker缓存和容器
cleanup_docker() {
    log_info "清理Docker缓存和旧容器..."
    
    # 停止并删除相关容器
    log_info "停止现有容器..."
    docker-compose down --remove-orphans 2>/dev/null || true
    
    # 删除相关镜像（强制更新）
    log_info "删除旧的MySQL镜像缓存..."
    docker rmi mysql:8.0 2>/dev/null || true
    docker rmi $(docker images -q azure_speech_keymanager-main-app) 2>/dev/null || true
    
    # 清理未使用的镜像和容器
    log_info "清理Docker系统缓存..."
    docker system prune -f
    
    # 清理数据卷（可选，会删除数据库数据）
    read -p "是否清理数据库数据卷？这将删除所有现有数据 (y/N): " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        log_warning "清理数据库数据卷..."
        docker volume rm $(docker volume ls -q | grep azure_speech_keymanager) 2>/dev/null || true
    fi
    
    log_success "Docker清理完成"
    echo ""
}

# 拉取最新镜像
pull_images() {
    log_info "拉取最新Docker镜像..."
    
    # 强制拉取最新的MySQL镜像
    docker pull mysql:8.0
    docker pull redis:7-alpine
    docker pull node:18-alpine
    
    log_success "镜像拉取完成"
    echo ""
}

# 构建应用镜像
build_app() {
    log_info "构建应用镜像..."
    
    # 构建应用镜像
    docker-compose build --no-cache app
    
    log_success "应用镜像构建完成"
    echo ""
}

# 启动服务
start_services() {
    log_info "启动服务..."
    
    # 启动所有服务
    docker-compose up -d
    
    # 等待服务启动
    log_info "等待服务启动..."
    sleep 15
    
    # 检查服务状态
    log_info "检查服务状态..."
    docker-compose ps
    echo ""
}

# 验证部署
verify_deployment() {
    log_info "验证部署状态..."
    
    # 等待应用完全启动
    local max_attempts=30
    local attempt=1
    
    while [ $attempt -le $max_attempts ]; do
        log_info "尝试连接应用... ($attempt/$max_attempts)"
        
        if curl -s http://localhost:3019/api/health > /dev/null 2>&1; then
            break
        fi
        
        if [ $attempt -eq $max_attempts ]; then
            log_error "应用启动超时，请检查日志"
            docker-compose logs app --tail 50
            exit 1
        fi
        
        sleep 2
        ((attempt++))
    done
    
    # 检查健康状态
    local health_response=$(curl -s http://localhost:3019/api/health)
    local status=$(echo $health_response | jq -r '.data.status' 2>/dev/null || echo "unknown")
    
    if [ "$status" = "healthy" ]; then
        log_success "应用部署成功！"
        echo ""
        echo "🎉 部署验证结果："
        echo "   ✅ 应用状态: $(echo $health_response | jq -r '.data.status')"
        echo "   ✅ 数据库连接: $(echo $health_response | jq -r '.data.database')"
        echo "   ✅ Redis连接: $(echo $health_response | jq -r '.data.redis')"
        echo "   ✅ 密钥管理器: $(echo $health_response | jq -r '.data.keyManager')"
        echo ""
        echo "🌐 访问地址："
        echo "   前端: http://localhost:3000"
        echo "   后端API: http://localhost:3019"
        echo "   健康检查: http://localhost:3019/api/health"
    else
        log_error "应用部署失败，状态: $status"
        echo ""
        log_info "查看应用日志："
        docker-compose logs app --tail 50
        exit 1
    fi
}

# 显示SSL修复信息
show_ssl_fix_info() {
    echo ""
    echo "🔧 SSL修复说明："
    echo "=================================================="
    echo "本次修复解决了以下问题："
    echo "1. MySQL 8.0 SSL证书自签名错误"
    echo "2. 客户端SSL连接参数不兼容"
    echo "3. Docker环境SSL配置冲突"
    echo ""
    echo "修复内容："
    echo "- docker-compose.yml: 添加 --skip-ssl 参数"
    echo "- start.sh: 统一使用 --skip-ssl 参数"
    echo "- 兼容MySQL 5.7和8.0版本"
    echo ""
    echo "⚠️  注意事项："
    echo "- SSL已禁用，仅适用于内网环境"
    echo "- 生产环境建议配置正确的SSL证书"
    echo "- 保底密钥功能已完全修复"
    echo ""
}

# 主函数
main() {
    echo "开始SSL修复部署流程..."
    echo ""
    
    # 检查是否在正确的目录
    if [ ! -f "docker-compose.yml" ]; then
        log_error "请在项目根目录下运行此脚本"
        exit 1
    fi
    
    # 执行部署步骤
    check_docker
    cleanup_docker
    pull_images
    build_app
    start_services
    verify_deployment
    show_ssl_fix_info
    
    log_success "🎉 SSL修复部署完成！"
}

# 错误处理
trap 'log_error "部署过程中发生错误，请检查上述日志"; exit 1' ERR

# 运行主函数
main "$@"
