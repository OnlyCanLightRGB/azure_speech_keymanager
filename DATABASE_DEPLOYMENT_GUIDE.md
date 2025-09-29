# Azure Speech Key Manager - 数据库部署指南

## 概述

本文档详细说明了Azure Speech Key Manager项目的数据库结构、迁移系统和部署流程，确保在新环境或客户系统中能够正确初始化数据库。

## 数据库架构

### 核心表结构

#### 1. 主要业务表

**azure_keys** - Azure Speech服务密钥管理
- 存储Azure Speech服务的API密钥
- 支持状态管理（enabled/disabled/cooldown）
- 包含使用统计和错误计数

**translation_keys** - Azure翻译服务密钥管理
- 存储Azure Translation服务的API密钥
- 与azure_keys表结构相似

**system_config** - 系统配置
- 存储系统级配置参数
- 包括冷却时间、错误码配置等

#### 2. 账单管理表

**json_billing_configs** - JSON配置文件管理
- 存储上传的Azure凭据配置
- 支持自动查询调度
- 字段包括：
  - `query_interval_minutes`: 查询间隔（分钟）
  - `auto_query_enabled`: 是否启用自动查询
  - `next_query_time`: 下次查询时间

**json_billing_history** - JSON配置查询历史
- 记录每次账单查询的结果
- 包含成本数据和查询状态

**billing_subscriptions** - 传统订阅模式管理
- 管理Azure订阅的账单查询
- 支持小时和分钟级别的查询间隔

**billing_history** - 订阅账单历史
- 详细的账单查询记录
- 包含成本分析和异常检测

**billing_resource_history** - 资源级别账单历史
- 记录每个Azure资源的成本详情
- 支持使用量分析

#### 3. 日志和调度表

**key_logs** / **translation_key_logs** - 操作日志
- 记录密钥的所有操作
- 包含状态码和详细信息

**json_billing_schedules** - 调度记录
- 跟踪JSON配置的调度执行
- 记录执行状态和结果

## 迁移系统

### 迁移文件结构

```
database/migrations/
├── 000_create_migrations_table.sql          # 迁移表创建
├── 001_initial_schema.sql                   # 初始数据库结构
├── 001_fix_json_billing_configs_table.sql   # JSON配置表修复
├── 002_fix_json_billing_history_table.sql   # JSON历史表修复
├── 005_mysql57_compatibility.sql            # MySQL 5.7兼容性
├── 006_create_json_billing_tables.sql       # JSON账单表创建
├── 006_create_billing_history_tables.sql    # 账单历史表创建
├── 008_add_status_code_to_logs.sql          # 日志表状态码字段
├── 009_create_billing_subscriptions_table.sql # 订阅表创建
├── 010_create_billing_resource_history_table.sql # 资源历史表
└── 011_add_query_interval_minutes_to_billing_subscriptions.sql # 分钟间隔字段
```

### 迁移管理器特性

1. **自动检测和执行**: 服务器启动时自动检查并执行待执行的迁移
2. **校验和验证**: 每个迁移文件都有校验和，防止重复执行
3. **MySQL版本兼容**: 自动检测MySQL版本并应用兼容性修复
4. **错误处理**: 智能处理重复字段等常见错误
5. **事务支持**: 每个迁移在事务中执行，确保原子性

## 部署流程

### 新环境部署

1. **创建数据库**
```sql
CREATE DATABASE azure_speech_keymanager CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
```

2. **配置环境变量**
```bash
DB_HOST=localhost
DB_PORT=3306
DB_USER=root
DB_PASSWORD=your_password
DB_NAME=azure_speech_keymanager
```

3. **启动服务器**
```bash
npm run dev:backend:stable
```

服务器启动时会自动：
- 连接数据库
- 创建迁移表
- 执行所有待执行的迁移
- 初始化系统配置

### 字段映射检查

系统中存在以下关键字段映射：

#### JSON配置表字段映射
```typescript
// 数据库字段 -> TypeScript接口
config_name -> configName
file_name -> fileName  
file_path -> filePath
app_id -> appId
tenant_id -> tenantId
display_name -> displayName
auto_query_enabled -> autoQueryEnabled
query_interval_minutes -> queryIntervalMinutes
last_query_time -> lastQueryTime
next_query_time -> nextQueryTime
error_message -> errorMessage
created_at -> createdAt
updated_at -> updatedAt
```

#### 订阅表字段映射
```typescript
// 数据库字段 -> TypeScript接口
subscription_id -> subscriptionId
subscription_name -> subscriptionName
tenant_id -> tenantId
auto_query_enabled -> autoQueryEnabled
query_interval_hours -> queryIntervalHours
query_interval_minutes -> queryIntervalMinutes
last_query_time -> lastQueryTime
next_query_time -> nextQueryTime
```

## 常见问题和解决方案

### 1. 字段映射错误 ⚠️ **关键问题**
**问题**: `File path is undefined for config: undefined`
**原因**: SQL查询使用`SELECT *`但没有字段映射，导致JavaScript对象属性为undefined
**解决**: 在AutoBillingService.ts中使用完整的字段映射查询
```sql
SELECT id, config_name as configName, file_name as fileName, file_path as filePath,
       app_id as appId, tenant_id as tenantId, display_name as displayName,
       password, auto_query_enabled as autoQueryEnabled,
       query_interval_minutes as queryIntervalMinutes,
       last_query_time as lastQueryTime, next_query_time as nextQueryTime,
       status, error_message as errorMessage,
       created_at as createdAt, updated_at as updatedAt
FROM json_billing_configs WHERE ...
```

### 2. 定时任务不执行 ⚠️ **关键问题**
**问题**: 设置的每1分钟循环查询不生效
**根本原因**:
- SQL查询中字段映射缺失导致配置对象属性为undefined
- 定时器创建时无法获取正确的文件路径和配置名称
- 执行失败后定时器被清除但无法重新创建
**解决**:
- 修复所有SQL查询的字段映射
- 确保定时器重新创建逻辑正确
- 添加错误处理和日志记录

### 3. 迁移语法错误
**问题**: `ADD COLUMN IF NOT EXISTS` 语法错误
**原因**: MySQL不支持`ALTER TABLE ADD COLUMN IF NOT EXISTS`语法
**解决**: 使用动态SQL检查列是否存在
```sql
SET @column_exists = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE ...);
SET @sql = IF(@column_exists = 0, 'ALTER TABLE ... ADD COLUMN ...', 'SELECT ...');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
```

### 4. 迁移重复执行
**问题**: 迁移文件重复执行导致错误
**解决**: 迁移管理器会自动跳过已执行的迁移，使用校验和验证

### 5. MySQL版本兼容性
**问题**: MySQL 5.7和8.0的语法差异
**解决**: 自动检测版本并应用兼容性迁移

### 6. 数据库表不一致
**问题**: 手动创建的数据库与迁移文件不匹配
**现状**: 当前数据库使用`database_migrations`表而不是`migrations`表
**解决**: 迁移管理器会自动适配不同的表名

## 数据完整性检查

部署后建议执行以下检查：

### 基础表检查
```sql
-- 检查关键表是否存在
SHOW TABLES LIKE '%billing%';

-- 检查字段完整性
DESCRIBE json_billing_configs;
DESCRIBE billing_subscriptions;
DESCRIBE billing_history;
DESCRIBE billing_resource_history;

-- 检查迁移记录（注意：表名可能是migrations或database_migrations）
SELECT * FROM database_migrations ORDER BY applied_at DESC LIMIT 10;
-- 或者
SELECT * FROM migrations ORDER BY applied_at DESC LIMIT 10;

-- 检查系统配置
SELECT * FROM system_config;
```

### 关键字段验证
```sql
-- 验证json_billing_configs表的关键字段
SELECT COLUMN_NAME, DATA_TYPE, IS_NULLABLE, COLUMN_DEFAULT
FROM INFORMATION_SCHEMA.COLUMNS
WHERE TABLE_SCHEMA = DATABASE()
AND TABLE_NAME = 'json_billing_configs'
AND COLUMN_NAME IN ('query_interval_minutes', 'config_name', 'file_path', 'auto_query_enabled')
ORDER BY COLUMN_NAME;

-- 验证billing_subscriptions表的关键字段
SELECT COLUMN_NAME, DATA_TYPE, IS_NULLABLE, COLUMN_DEFAULT
FROM INFORMATION_SCHEMA.COLUMNS
WHERE TABLE_SCHEMA = DATABASE()
AND TABLE_NAME = 'billing_subscriptions'
AND COLUMN_NAME IN ('query_interval_minutes', 'query_interval_hours', 'auto_query_enabled')
ORDER BY COLUMN_NAME;

-- 检查字段映射一致性
SELECT
    'json_billing_configs' as table_name,
    COUNT(*) as total_configs,
    SUM(CASE WHEN auto_query_enabled = 1 THEN 1 ELSE 0 END) as enabled_configs,
    AVG(query_interval_minutes) as avg_interval_minutes
FROM json_billing_configs
UNION ALL
SELECT
    'billing_subscriptions' as table_name,
    COUNT(*) as total_subscriptions,
    SUM(CASE WHEN auto_query_enabled = 1 THEN 1 ELSE 0 END) as enabled_subscriptions,
    AVG(query_interval_minutes) as avg_interval_minutes
FROM billing_subscriptions;
```

### 功能测试
```sql
-- 测试定时配置是否正常
SELECT id, config_name, auto_query_enabled, query_interval_minutes,
       last_query_time, next_query_time, status
FROM json_billing_configs
WHERE auto_query_enabled = 1;

-- 检查最近的查询历史
SELECT id, file_name, query_status, total_cost, query_date, error_message
FROM json_billing_history
ORDER BY query_date DESC LIMIT 5;
```

## 备份和恢复

### 备份
```bash
mysqldump -u root -p azure_speech_keymanager > backup.sql
```

### 恢复
```bash
mysql -u root -p azure_speech_keymanager < backup.sql
```

## 监控和维护

1. **定期检查迁移状态**
2. **监控数据库连接和性能**
3. **定期备份重要数据**
4. **检查日志表大小，必要时清理旧记录**

---

此文档确保了数据库在任何新环境中都能正确部署和运行。
