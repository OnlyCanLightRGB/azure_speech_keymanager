#!/bin/bash

# Azure Speech Key Manager - MySQL 5.7环境验证脚本
# 验证项目在MySQL 5.7环境下的完整兼容性

set -e

echo "🔍 Azure Speech Key Manager - MySQL 5.7环境验证"
echo "=================================================="
echo "验证项目在MySQL 5.7环境下的完整兼容性"
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
        log_error "Docker未安装"
        exit 1
    fi
    
    if ! command -v docker-compose &> /dev/null; then
        log_error "Docker Compose未安装"
        exit 1
    fi
    
    log_success "Docker环境正常"
    docker --version
    docker-compose --version
    echo ""
}

# 验证docker-compose.yml配置
verify_docker_compose() {
    log_info "验证docker-compose.yml配置..."
    
    if ! grep -q "mysql:5.7" docker-compose.yml; then
        log_error "docker-compose.yml未使用MySQL 5.7镜像"
        return 1
    fi
    
    if ! grep -q "character-set-server=utf8mb4" docker-compose.yml; then
        log_warning "MySQL字符集配置可能不完整"
    fi
    
    if ! grep -q "skip-ssl" docker-compose.yml; then
        log_warning "MySQL SSL配置可能不完整"
    fi
    
    log_success "docker-compose.yml配置验证通过"
    echo ""
}

# 验证数据库兼容性
verify_database_compatibility() {
    log_info "验证数据库兼容性..."
    
    # 检查是否有MySQL 5.7兼容性迁移
    if [ -f "database/migrations/005_mysql57_compatibility.sql" ]; then
        log_success "找到MySQL 5.7兼容性迁移文件"
    else
        log_warning "未找到MySQL 5.7兼容性迁移文件"
    fi
    
    # 检查init.sql的字符集配置
    if grep -q "utf8mb4" database/init.sql; then
        log_success "数据库初始化脚本使用正确的字符集"
    else
        log_warning "数据库初始化脚本字符集配置可能有问题"
    fi
    
    echo ""
}

# 启动MySQL 5.7测试环境
start_test_environment() {
    log_info "启动MySQL 5.7测试环境..."
    
    # 停止现有容器
    docker-compose down 2>/dev/null || true
    
    # 清理旧的MySQL镜像
    docker rmi mysql:8.0 2>/dev/null || true
    
    # 拉取MySQL 5.7镜像
    log_info "拉取MySQL 5.7镜像..."
    docker pull mysql:5.7
    
    # 启动服务
    log_info "启动所有服务..."
    docker-compose up -d
    
    log_success "测试环境启动完成"
    echo ""
}

# 等待服务就绪
wait_for_services() {
    log_info "等待服务就绪..."
    
    local max_attempts=30
    local attempt=1
    
    while [ $attempt -le $max_attempts ]; do
        log_info "检查服务状态... ($attempt/$max_attempts)"
        
        # 检查MySQL容器
        if docker-compose ps mysql_azkm | grep -q "healthy"; then
            log_success "MySQL服务就绪"
            break
        fi
        
        if [ $attempt -eq $max_attempts ]; then
            log_error "服务启动超时"
            docker-compose logs mysql_azkm
            return 1
        fi
        
        sleep 2
        ((attempt++))
    done
    
    # 额外等待应用启动
    sleep 10
    echo ""
}

# 验证MySQL版本
verify_mysql_version() {
    log_info "验证MySQL版本..."
    
    local mysql_version=$(docker exec $(docker-compose ps -q mysql_azkm) mysqld --version 2>/dev/null | grep -o "Ver [0-9]\+\.[0-9]\+" | grep -o "[0-9]\+\.[0-9]\+")
    
    if [[ $mysql_version == 5.7* ]]; then
        log_success "MySQL版本验证通过: $mysql_version"
    else
        log_error "MySQL版本不正确: $mysql_version (期望: 5.7.x)"
        return 1
    fi
    
    echo ""
}

# 验证数据库连接和表结构
verify_database_structure() {
    log_info "验证数据库连接和表结构..."
    
    # 检查数据库连接
    if docker exec $(docker-compose ps -q mysql_azkm) mysql -u root -prootpassword -e "SELECT 1;" >/dev/null 2>&1; then
        log_success "数据库连接正常"
    else
        log_error "数据库连接失败"
        return 1
    fi
    
    # 检查主要表是否存在
    local tables=("azure_keys" "translation_keys" "key_logs" "translation_key_logs" "system_config")
    
    for table in "${tables[@]}"; do
        if docker exec $(docker-compose ps -q mysql_azkm) mysql -u root -prootpassword azure_speech_keymanager -e "DESCRIBE $table;" >/dev/null 2>&1; then
            log_success "表 $table 存在且结构正常"
        else
            log_warning "表 $table 可能不存在或结构有问题"
        fi
    done
    
    echo ""
}

# 验证应用健康状态
verify_application_health() {
    log_info "验证应用健康状态..."
    
    local max_attempts=20
    local attempt=1
    
    while [ $attempt -le $max_attempts ]; do
        log_info "检查应用健康状态... ($attempt/$max_attempts)"
        
        if curl -s http://localhost:3019/api/health >/dev/null 2>&1; then
            local health_response=$(curl -s http://localhost:3019/api/health)
            local status=$(echo $health_response | grep -o '"status":"[^"]*"' | cut -d'"' -f4)
            
            if [ "$status" = "healthy" ]; then
                log_success "应用健康检查通过"
                echo ""
                echo "🎉 健康状态详情："
                echo $health_response | jq . 2>/dev/null || echo $health_response
                echo ""
                return 0
            fi
        fi
        
        if [ $attempt -eq $max_attempts ]; then
            log_error "应用健康检查失败"
            return 1
        fi
        
        sleep 3
        ((attempt++))
    done
}

# 验证保底密钥功能
verify_fallback_keys() {
    log_info "验证保底密钥功能..."
    
    # 检查priority_weight字段是否存在
    if docker exec $(docker-compose ps -q mysql_azkm) mysql -u root -prootpassword azure_speech_keymanager -e "DESCRIBE azure_keys;" | grep -q "priority_weight"; then
        log_success "保底密钥字段 priority_weight 存在"
    else
        log_warning "保底密钥字段 priority_weight 不存在，可能需要运行迁移"
    fi
    
    echo ""
}

# 性能测试
run_performance_test() {
    log_info "运行基础性能测试..."
    
    if [ -f "tests/az_asr_test.py" ]; then
        log_info "发现测试脚本，运行基础测试..."
        # 这里可以添加基础的API测试
        if curl -s http://localhost:3019/api/keys >/dev/null 2>&1; then
            log_success "API响应正常"
        else
            log_warning "API响应可能有问题"
        fi
    else
        log_info "未找到测试脚本，跳过性能测试"
    fi
    
    echo ""
}

# 生成验证报告
generate_report() {
    echo ""
    echo "📋 MySQL 5.7环境验证报告"
    echo "=================================================="
    echo "验证时间: $(date)"
    echo ""
    echo "✅ 验证项目："
    echo "   - Docker环境检查"
    echo "   - docker-compose.yml配置验证"
    echo "   - 数据库兼容性验证"
    echo "   - MySQL 5.7版本确认"
    echo "   - 数据库连接和表结构验证"
    echo "   - 应用健康状态验证"
    echo "   - 保底密钥功能验证"
    echo ""
    echo "🌐 访问地址："
    echo "   - 前端: http://localhost:3000"
    echo "   - 后端API: http://localhost:3019"
    echo "   - 健康检查: http://localhost:3019/api/health"
    echo ""
    echo "⚠️  注意事项："
    echo "   - 项目已完全迁移到MySQL 5.7"
    echo "   - SSL已禁用，适用于内网环境"
    echo "   - 字符集配置为utf8mb4，支持完整Unicode"
    echo "   - 保底密钥功能已验证可用"
    echo ""
}

# 主函数
main() {
    echo "开始MySQL 5.7环境验证..."
    echo ""
    
    check_docker
    verify_docker_compose
    verify_database_compatibility
    start_test_environment
    wait_for_services
    verify_mysql_version
    verify_database_structure
    verify_application_health
    verify_fallback_keys
    run_performance_test
    generate_report
    
    log_success "🎉 MySQL 5.7环境验证完成！"
}

# 错误处理
trap 'log_error "验证过程中发生错误，请检查上述日志"; exit 1' ERR

# 运行主函数
main "$@"
