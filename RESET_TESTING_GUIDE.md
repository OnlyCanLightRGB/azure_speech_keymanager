# Azure Speech Key Manager - 重置测试指南

## 概述

本指南提供了将系统完全重置到初始状态的方法，就像从未使用过Docker一样。这对于测试、演示或故障排除非常有用。

## 🛠️ 可用脚本

### 1. `reset-to-fresh.sh` - 完全重置脚本
**功能**: 将系统恢复到完全初始状态
**删除内容**:
- 所有Docker容器、镜像、卷
- 所有上传的文件和配置
- 所有日志和备份文件
- 所有构建文件和缓存

### 2. `verify-fresh-state.sh` - 状态验证脚本
**功能**: 验证系统是否处于初始状态
**检查项目**:
- Docker资源状态
- 本地文件清理情况
- 构建文件状态

### 3. `test-fresh-startup.sh` - 全新启动测试脚本
**功能**: 测试从初始状态启动的完整流程
**测试内容**:
- 服务启动和就绪检查
- 基本功能测试
- 文件上传和配置保存测试

## 🚀 使用方法

### 方法一：完全自动化测试

```bash
# 1. 完全重置系统
./reset-to-fresh.sh

# 2. 验证初始状态
./verify-fresh-state.sh

# 3. 测试全新启动
./test-fresh-startup.sh
```

### 方法二：手动步骤

```bash
# 1. 停止所有服务
docker-compose down --volumes --remove-orphans

# 2. 删除所有Docker资源
docker system prune -af
docker volume prune -f

# 3. 清理本地文件
rm -rf ./uploads/* ./json/* ./logs/* ./backups/* ./credentials/*
rm -rf ./dist ./frontend/.next ./frontend/out

# 4. 重新启动
docker-compose up --build
```

## 📋 测试场景

### 场景1：新环境部署测试
```bash
# 模拟在全新电脑上部署
./reset-to-fresh.sh
./test-fresh-startup.sh
```

### 场景2：故障排除
```bash
# 当系统出现问题时
./verify-fresh-state.sh  # 检查当前状态
./reset-to-fresh.sh      # 如果需要重置
```

### 场景3：演示准备
```bash
# 准备演示环境
./reset-to-fresh.sh
docker-compose up --build -d
# 系统现在处于全新状态，可以进行演示
```

## ✅ 验证检查点

### 初始状态检查
- [ ] 无Docker容器运行
- [ ] 无相关Docker镜像
- [ ] 无数据卷存在
- [ ] 无用户上传文件
- [ ] 无配置文件
- [ ] 无日志文件
- [ ] 无构建文件

### 启动后检查
- [ ] 服务健康检查通过
- [ ] 前端页面正常加载
- [ ] 后端API响应正常
- [ ] 数据库连接正常
- [ ] Redis连接正常
- [ ] 文件上传功能正常
- [ ] 定时器创建正常

## 🔧 故障排除

### 重置脚本失败
```bash
# 手动强制清理
docker stop $(docker ps -aq) 2>/dev/null || true
docker rm $(docker ps -aq) 2>/dev/null || true
docker rmi $(docker images -q) 2>/dev/null || true
docker volume rm $(docker volume ls -q) 2>/dev/null || true
docker network prune -f
docker system prune -af
```

### 服务启动失败
```bash
# 查看详细日志
docker-compose logs app --tail=50

# 检查端口占用
lsof -i :3000
lsof -i :3019

# 重新构建
docker-compose build --no-cache
```

### 权限问题
```bash
# 修复目录权限
sudo chown -R $USER:$USER ./uploads ./json ./logs ./backups ./credentials
chmod -R 755 ./uploads ./json ./logs ./backups ./credentials
```

## 📊 预期结果

### 重置后的系统状态
- 数据库：全新的空数据库，只有基础表结构
- 配置：无任何用户配置
- 文件：无任何上传文件
- 定时器：无任何定时任务
- 日志：无历史日志记录

### 首次启动后
- 所有服务正常运行
- 数据库初始化完成
- 基础数据已插入
- 系统就绪，可以接受用户操作

## 🎯 最佳实践

1. **定期测试**: 定期运行完整的重置测试，确保系统可以从零开始正常工作
2. **备份重要数据**: 在重置前备份任何重要的配置或数据
3. **文档更新**: 如果修改了系统，相应更新重置脚本
4. **自动化集成**: 将这些脚本集成到CI/CD流程中

## 🚨 注意事项

- ⚠️ 重置操作不可逆，会删除所有用户数据
- ⚠️ 确保在重置前备份重要数据
- ⚠️ 重置过程中不要中断，可能导致不一致状态
- ⚠️ 在生产环境中谨慎使用重置功能
