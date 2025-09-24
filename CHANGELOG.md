# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.2.0] - 2024-12-XX

### Added
- **项目维护工具**: 新增自动清理脚本 `scripts/cleanup.ts`
- **项目统计功能**: 实时统计项目文件类型和数量
- **配置检查**: 自动验证 .gitignore 和 package.json 配置
- **环境状态检查**: 检查开发环境和依赖状态
- **翻译服务API**: 完整的翻译密钥管理接口
- **批量上传管理**: JSON文件批量创建和管理密钥
- **系统清理接口**: 新增 `/api/system/cleanup` 接口

### Enhanced
- **API文档**: 补充翻译服务和上传管理API文档
- **用户指南**: 完善维护和故障排除说明
- **README**: 添加清理脚本使用说明和项目维护工具介绍

### Fixed
- 临时文件清理逻辑优化
- 项目结构统计准确性提升

## [1.1.0] - 2024-06-XX

### Added
- **轮询策略**: 实现 Round Robin 密钥轮换策略
- **负载均衡**: 多密钥均衡负载分配
- **Redis缓存**: 优化高并发场景下的性能
- **密钥冷却机制**: 智能冷却和恢复管理

### Enhanced
- **并发安全**: Redis分布式锁确保线程安全
- **错误处理**: 改进API错误处理和状态管理
- **监控功能**: 增强密钥使用统计和监控

## [1.0.0] - 2024-01-XX

### Added
- Initial release of Azure Speech Key Manager
- Backend API with TypeScript and Express
- Frontend interface with Next.js and Material UI
- MySQL database integration
- Redis caching support
- Key management functionality:
  - Add, edit, delete Azure Speech Service keys
  - Enable/disable keys
  - Test key functionality
  - Automatic cooldown management
- Real-time key status monitoring
- Comprehensive logging system
- RESTful API endpoints
- Chinese language interface
- Automated key rotation and load balancing
- Error handling with retry logic
- Thread-safe operations with Redis

### Features
- **Key Management**: Complete CRUD operations for Azure Speech Service keys
- **Intelligent Cooldown**: Automatic key cooldown and recovery for rate-limited keys
- **Status Management**: Automatic key disabling for authentication errors
- **Usage Tracking**: Monitor key usage statistics and error rates
- **Real-time Dashboard**: Live system overview with key statistics
- **Comprehensive API**: RESTful API for all operations
- **Security**: Secure key storage and management
- **Monitoring**: Detailed logging and audit trail

### Technical Stack
- **Backend**: TypeScript, Express.js, Node.js
- **Frontend**: Next.js, React, Material UI
- **Database**: MySQL 8.0+
- **Cache**: Redis
- **Testing**: Jest
- **Development**: ESLint, TypeScript, Nodemon
