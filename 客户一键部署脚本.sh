#!/bin/bash

# Azure Speech Key Manager 客户服务器一键部署脚本
# 版本: 1.0
# 日期: 2025-10-01

set -e  # 遇到错误立即退出

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

# 检查系统要求
check_requirements() {
    log_info "检查系统要求..."
    
    # 检查Docker
    if ! command -v docker &> /dev/null; then
        log_error "Docker未安装，请先安装Docker"
        echo "安装指南: https://docs.docker.com/get-docker/"
        exit 1
    fi
    
    # 检查Docker Compose
    if ! command -v docker-compose &> /dev/null; then
        log_error "Docker Compose未安装，请先安装Docker Compose"
        echo "安装指南: https://docs.docker.com/compose/install/"
        exit 1
    fi
    
    # 检查Docker版本
    DOCKER_VERSION=$(docker --version | grep -oE '[0-9]+\.[0-9]+' | head -1)
    log_info "Docker版本: $DOCKER_VERSION"
    
    # 检查内存
    MEMORY_GB=$(free -g | awk '/^Mem:/{print $2}')
    if [ "$MEMORY_GB" -lt 2 ]; then
        log_warning "系统内存少于2GB，可能影响性能"
    fi
    
    # 检查磁盘空间
    DISK_SPACE=$(df -BG . | awk 'NR==2{print $4}' | sed 's/G//')
    if [ "$DISK_SPACE" -lt 5 ]; then
        log_warning "可用磁盘空间少于5GB，可能影响部署"
    fi
    
    log_success "系统要求检查完成"
}

# 检查端口占用
check_ports() {
    log_info "检查端口占用..."
    
    if lsof -i :3000 &> /dev/null; then
        log_error "端口3000被占用，请释放端口或修改配置"
        lsof -i :3000
        exit 1
    fi
    
    if lsof -i :3019 &> /dev/null; then
        log_error "端口3019被占用，请释放端口或修改配置"
        lsof -i :3019
        exit 1
    fi
    
    log_success "端口检查通过"
}

# 配置Docker镜像源
configure_docker_registry() {
    log_info "配置Docker镜像源..."
    
    if [ ! -f /etc/docker/daemon.json ]; then
        log_info "配置国内Docker镜像源以提高下载速度..."
        sudo mkdir -p /etc/docker
        sudo tee /etc/docker/daemon.json <<-'EOF'
{
  "registry-mirrors": [
    "https://docker.mirrors.ustc.edu.cn",
    "https://hub-mirror.c.163.com",
    "https://mirror.baidubce.com"
  ]
}
EOF
        sudo systemctl daemon-reload
        sudo systemctl restart docker
        log_success "Docker镜像源配置完成"
    else
        log_info "Docker镜像源已配置"
    fi
}

# 预下载镜像
preload_images() {
    log_info "预下载Docker镜像..."
    
    # 镜像列表
    IMAGES=("node:18-alpine" "mysql:5.7" "redis:7-alpine")
    
    for image in "${IMAGES[@]}"; do
        log_info "下载镜像: $image"
        if docker pull "$image"; then
            log_success "镜像 $image 下载成功"
        else
            log_warning "镜像 $image 下载失败，将在构建时重试"
        fi
    done
}

# 设置权限
setup_permissions() {
    log_info "设置文件权限..."
    
    # 添加用户到docker组
    if ! groups $USER | grep -q docker; then
        log_info "添加用户到docker组..."
        sudo usermod -aG docker $USER
        log_warning "请重新登录或运行 'newgrp docker' 使权限生效"
    fi
    
    # 设置脚本权限
    chmod +x *.sh 2>/dev/null || true
    
    log_success "权限设置完成"
}

# 清理旧环境
cleanup_old_environment() {
    log_info "清理旧环境..."
    
    # 停止旧容器
    docker-compose down -v 2>/dev/null || true
    
    # 清理未使用的镜像和容器
    docker system prune -f 2>/dev/null || true
    
    log_success "环境清理完成"
}

# 部署应用
deploy_application() {
    log_info "开始部署应用..."
    
    # 构建和启动服务
    if docker-compose up --build -d; then
        log_success "服务启动成功！"
    else
        log_error "服务启动失败"
        log_info "查看错误日志:"
        docker-compose logs app --tail 20
        exit 1
    fi
}

# 等待服务就绪
wait_for_services() {
    log_info "等待服务就绪..."
    
    # 等待60秒
    for i in {1..60}; do
        if curl -s http://localhost:3019/api/health &> /dev/null; then
            log_success "服务已就绪！"
            return 0
        fi
        echo -n "."
        sleep 1
    done
    
    log_error "服务启动超时"
    return 1
}

# 健康检查
health_check() {
    log_info "进行健康检查..."
    
    # 检查健康状态
    HEALTH_RESPONSE=$(curl -s http://localhost:3019/api/health)
    if echo "$HEALTH_RESPONSE" | grep -q '"status":"healthy"'; then
        log_success "健康检查通过！"
        
        # 显示服务信息
        echo "$HEALTH_RESPONSE" | jq '.' 2>/dev/null || echo "$HEALTH_RESPONSE"
        
        return 0
    else
        log_error "健康检查失败"
        echo "响应: $HEALTH_RESPONSE"
        return 1
    fi
}

# 显示部署结果
show_deployment_result() {
    echo ""
    echo "=========================================="
    log_success "🎉 部署完成！"
    echo "=========================================="
    echo ""
    echo "访问地址："
    echo "- 前端界面: http://localhost:3000"
    echo "- 后端API: http://localhost:3019"
    echo "- 健康检查: http://localhost:3019/api/health"
    echo ""
    echo "常用命令："
    echo "- 查看服务状态: docker-compose ps"
    echo "- 查看日志: docker-compose logs app"
    echo "- 重启服务: docker-compose restart"
    echo "- 停止服务: docker-compose down"
    echo ""
    echo "如遇问题，请查看 '客户部署问题解决方案.md' 文件"
    echo ""
}

# 主函数
main() {
    echo "=========================================="
    echo "Azure Speech Key Manager 一键部署脚本"
    echo "=========================================="
    echo ""
    
    # 执行部署步骤
    check_requirements
    check_ports
    configure_docker_registry
    preload_images
    setup_permissions
    cleanup_old_environment
    deploy_application
    
    if wait_for_services && health_check; then
        show_deployment_result
    else
        log_error "部署失败，请查看日志排查问题"
        echo ""
        echo "故障排除命令："
        echo "- docker-compose logs app --tail 50"
        echo "- docker-compose ps"
        echo "- docker system df"
        exit 1
    fi
}

# 运行主函数
main "$@"
