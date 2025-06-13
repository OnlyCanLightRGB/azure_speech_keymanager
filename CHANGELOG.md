# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
