#!/bin/bash

# Azure Speech Key Manager 账单查询功能初始化脚本
# 版本: 1.0
# 日期: 2025-10-01

set -e

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

# 显示标题
show_header() {
    echo "=========================================="
    echo "Azure Speech Key Manager"
    echo "账单查询功能初始化向导"
    echo "=========================================="
    echo ""
}

# 检查服务状态
check_services() {
    log_info "检查服务状态..."
    
    if ! docker-compose ps | grep -q "Up.*healthy"; then
        log_error "服务未正常运行，请先启动服务："
        echo "docker-compose up -d"
        exit 1
    fi
    
    log_success "服务运行正常"
}

# 创建示例凭据文件
create_sample_credentials() {
    log_info "创建示例Azure凭据文件..."
    
    cat > azure_credentials_sample.json << 'EOF'
{
  "appId": "your-azure-app-id-here",
  "displayName": "your-app-display-name",
  "password": "your-azure-app-password-here",
  "tenant": "your-azure-tenant-id-here"
}
EOF
    
    log_success "示例凭据文件已创建: azure_credentials_sample.json"
    echo "请编辑此文件，填入您的Azure服务主体信息"
}

# 测试账单查询脚本
test_billing_script() {
    log_info "测试账单查询脚本..."
    
    # 测试帮助信息
    log_info "测试帮助信息..."
    docker-compose exec app python3 /app/az.py --help
    
    log_success "账单查询脚本可以正常运行"
}

# 检查数据库配置
check_database_config() {
    log_info "检查数据库账单配置..."
    
    # 检查JSON配置
    JSON_CONFIGS=$(docker-compose exec mysql_azkm mysql -u root -prootpassword azure_speech_keymanager -se "SELECT COUNT(*) FROM json_billing_configs WHERE status='active' AND auto_query_enabled=1;")
    
    # 检查订阅配置
    SUBSCRIPTIONS=$(docker-compose exec mysql_azkm mysql -u root -prootpassword azure_speech_keymanager -se "SELECT COUNT(*) FROM billing_subscriptions WHERE status='active' AND auto_query_enabled=1;")
    
    echo "当前配置状态："
    echo "- 活跃的JSON配置: $JSON_CONFIGS"
    echo "- 活跃的订阅配置: $SUBSCRIPTIONS"
    
    if [ "$JSON_CONFIGS" -gt 0 ] || [ "$SUBSCRIPTIONS" -gt 0 ]; then
        log_success "发现已有账单配置"
    else
        log_warning "未发现活跃的账单配置"
    fi
}

# 显示配置指南
show_configuration_guide() {
    echo ""
    echo "=========================================="
    echo "📋 账单查询配置指南"
    echo "=========================================="
    echo ""
    echo "🔧 方法1: 通过Web界面配置"
    echo "1. 访问前端界面: http://localhost:3000"
    echo "2. 进入 'Azure账单' 页面"
    echo "3. 上传Azure凭据JSON文件"
    echo "4. 启用自动查询功能"
    echo ""
    echo "🔧 方法2: 手动测试账单查询"
    echo "1. 编辑 azure_credentials_sample.json 文件"
    echo "2. 运行测试命令:"
    echo "   docker-compose exec app python3 /app/az.py azure_credentials_sample.json"
    echo ""
    echo "📋 Azure服务主体创建步骤:"
    echo "1. 登录Azure门户"
    echo "2. 进入 'Azure Active Directory' > '应用注册'"
    echo "3. 点击 '新注册' 创建应用"
    echo "4. 记录 '应用程序(客户端)ID' 和 '目录(租户)ID'"
    echo "5. 进入 '证书和密码' > '新客户端密码'"
    echo "6. 记录生成的密码值"
    echo "7. 进入 '订阅' > 选择订阅 > 'IAM' > '添加角色分配'"
    echo "8. 分配 '账单读取者' 或 '读取者' 角色给应用"
    echo ""
}

# 显示定时查询状态
show_scheduler_status() {
    log_info "检查定时查询状态..."
    
    echo "最近的定时查询日志:"
    docker-compose exec app tail -10 /app/logs/combined.log | grep -E "(billing|Billing|scheduled|Scheduled)" || echo "未找到相关日志"
    
    echo ""
    echo "定时查询说明:"
    echo "- 系统每分钟检查一次是否有需要查询的配置"
    echo "- JSON配置和订阅配置都支持独立的查询间隔"
    echo "- 查询结果会保存到数据库中"
    echo "- 可以通过Web界面查看查询历史"
}

# 故障排除指南
show_troubleshooting() {
    echo ""
    echo "=========================================="
    echo "🔧 故障排除指南"
    echo "=========================================="
    echo ""
    echo "❌ 问题1: 账单查询脚本执行失败"
    echo "解决方案:"
    echo "- 检查Azure凭据文件格式是否正确"
    echo "- 确认服务主体有足够的权限"
    echo "- 检查网络连接是否正常"
    echo ""
    echo "❌ 问题2: 定时查询无法自动执行"
    echo "解决方案:"
    echo "- 确认数据库中有活跃的配置"
    echo "- 检查配置的查询间隔设置"
    echo "- 查看应用日志排查错误"
    echo ""
    echo "🔍 调试命令:"
    echo "- 查看应用日志: docker-compose logs app --tail 50"
    echo "- 查看数据库配置: 运行本脚本的数据库检查功能"
    echo "- 手动测试脚本: docker-compose exec app python3 /app/az.py --help"
    echo ""
}

# 主函数
main() {
    show_header
    
    # 检查服务状态
    check_services
    
    # 创建示例文件
    create_sample_credentials
    
    # 测试脚本
    test_billing_script
    
    # 检查数据库配置
    check_database_config
    
    # 显示配置指南
    show_configuration_guide
    
    # 显示定时查询状态
    show_scheduler_status
    
    # 显示故障排除指南
    show_troubleshooting
    
    echo ""
    log_success "初始化检查完成！"
    echo ""
    echo "🎯 下一步操作:"
    echo "1. 编辑 azure_credentials_sample.json 文件"
    echo "2. 通过Web界面 (http://localhost:3000) 配置账单查询"
    echo "3. 或手动测试: docker-compose exec app python3 /app/az.py azure_credentials_sample.json"
    echo ""
}

# 运行主函数
main "$@"
