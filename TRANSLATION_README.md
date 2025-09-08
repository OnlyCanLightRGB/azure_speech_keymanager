# Azure Translation Key Manager 功能说明

## 概述

本项目已扩展支持Azure翻译服务的key管理功能，包括文字翻译和语音翻译。翻译功能与现有的语音服务key管理功能并行运行，提供完整的Azure认知服务key管理解决方案。

## 功能特性

### 1. 文字翻译 (Text Translation)
- 支持Azure Translator API
- 多语言翻译支持
- 自动语言检测
- Key管理和状态监控

### 2. 语音翻译 (Speech Translation)
- 支持Azure Speech Translation API
- 语音到语音的实时翻译
- 支持多种音频格式
- Key管理和状态监控

### 3. Key管理功能
- 翻译key的添加、删除、启用、禁用
- 自动冷却机制（429错误处理）
- 使用统计和错误计数
- 详细的日志记录
- Redis缓存支持

### 4. JSON文件上传功能 ⭐ 新功能
- 支持通过JSON文件批量创建语音和翻译key
- 文件格式验证和错误处理
- 批量操作支持（启用、禁用、删除）
- 提供JSON模板下载
- 实时创建key，无需重启服务

## API端点

### 翻译Key管理

#### 获取翻译Key
```http
GET /api/translation/keys/get?region=global&tag=test
```

#### 添加翻译Key
```http
POST /api/translation/keys
Content-Type: application/json

{
  "key": "your_azure_translation_key",
  "region": "global",
  "keyname": "TranslationKey-001"
}
```

#### 设置Key状态
```http
POST /api/translation/keys/status
Content-Type: application/json

{
  "key": "your_azure_translation_key",
  "code": 429,
  "note": "Rate limit exceeded"
}
```

#### 测试翻译Key（文字翻译）
```http
POST /api/translation/keys/test
Content-Type: application/json

{
  "key": "your_azure_translation_key",
  "region": "global",
  "text": "Hello world",
  "from": "en",
  "to": "zh-Hans"
}
```

#### 测试翻译Key（语音翻译）
```http
POST /api/translation/keys/test-speech
Content-Type: application/json

{
  "key": "your_azure_translation_key",
  "region": "eastasia",
  "audioData": "base64_encoded_audio_data",
  "from": "en-US",
  "to": "zh-CN"
}
```

### 翻译服务

#### 文字翻译
```http
POST /api/translation/translate
Content-Type: application/json

{
  "text": "Hello world",
  "from": "en",
  "to": "zh-Hans",
  "apiVersion": "3.0"
}
```

#### 语音翻译
```http
POST /api/translation/translate-speech
Content-Type: application/json

{
  "audioData": "base64_encoded_audio_data",
  "from": "en-US",
  "to": "zh-CN",
  "voice": "zh-CN-XiaoxiaoNeural",
  "outputFormat": "audio-16khz-128kbitrate-mono-mp3"
}
```

### JSON文件上传功能 ⭐ 新功能

#### 上传JSON文件批量创建Key
```http
POST /api/upload/keys
Content-Type: multipart/form-data

file: your_keys.json
```

#### 获取JSON模板
```http
GET /api/upload/template?type=speech
GET /api/upload/template?type=translation
```

#### 验证JSON文件格式
```http
POST /api/upload/validate
Content-Type: multipart/form-data

file: your_keys.json
```

#### 批量操作Key
```http
POST /api/upload/bulk-operation
Content-Type: application/json

{
  "operation": "enable",
  "keys": ["key1", "key2", "key3"],
  "type": "speech"
}
```

## JSON文件格式

### 语音Key模板
```json
{
  "keys": [
    {
      "key": "your_azure_speech_key_1",
      "region": "eastasia",
      "keyname": "SpeechKey-001",
      "status": "enabled"
    },
    {
      "key": "your_azure_speech_key_2",
      "region": "eastasia",
      "keyname": "SpeechKey-002",
      "status": "enabled"
    }
  ],
  "type": "speech",
  "overwrite": false
}
```

### 翻译Key模板
```json
{
  "keys": [
    {
      "key": "your_azure_translation_key_1",
      "region": "global",
      "keyname": "TranslationKey-001",
      "status": "enabled"
    },
    {
      "key": "your_azure_translation_key_2",
      "region": "global",
      "keyname": "TranslationKey-002",
      "status": "enabled"
    }
  ],
  "type": "translation",
  "overwrite": false
}
```

## 数据库表结构

### translation_keys 表
```sql
CREATE TABLE `translation_keys` (
  `id` int NOT NULL AUTO_INCREMENT,
  `key` varchar(255) NOT NULL,
  `region` varchar(50) NOT NULL,
  `keyname` varchar(255) NOT NULL DEFAULT '',
  `status` enum('enabled','disabled','cooldown') NOT NULL DEFAULT 'enabled',
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `last_used` timestamp NULL DEFAULT NULL,
  `usage_count` int NULL DEFAULT 0,
  `error_count` int NULL DEFAULT 0,
  PRIMARY KEY (`id`),
  UNIQUE KEY `key` (`key`),
  KEY `idx_status_region` (`status`,`region`),
  KEY `idx_region` (`region`),
  KEY `idx_status` (`status`)
);
```

### translation_key_logs 表
```sql
CREATE TABLE `translation_key_logs` (
  `id` int NOT NULL AUTO_INCREMENT,
  `key_id` int NULL DEFAULT NULL,
  `action` enum('get_key','set_status','add_key','delete_key','disable_key','enable_key','test_key','cooldown_start','cooldown_end') NOT NULL,
  `status_code` int NULL DEFAULT NULL,
  `note` text NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `ip_address` varchar(45) NULL DEFAULT NULL,
  `user_agent` text NULL,
  PRIMARY KEY (`id`),
  KEY `idx_created_at` (`created_at`),
  KEY `idx_action` (`action`),
  KEY `idx_key_id` (`key_id`),
  CONSTRAINT `translation_key_logs_ibfk_1` FOREIGN KEY (`key_id`) REFERENCES `translation_keys` (`id`) ON DELETE SET NULL
);
```

## 客户端测试

### 运行翻译测试
```bash
cd tests
python az_translation_test.py
```

### 运行文件上传测试
```bash
cd tests
python upload_test.py
```

### 测试配置
- 目标RPM: 1000
- 测试持续时间: 2分钟
- 支持文字翻译和语音翻译测试
- 自动生成CSV测试报告

### 测试文件
- `az_translation_test.py`: 翻译服务并发性能测试器
- `upload_test.py`: JSON文件上传功能测试器
- `speech_keys_template.json`: 语音key JSON模板
- `translation_keys_template.json`: 翻译key JSON模板

## 配置说明

### 环境变量
```bash
# 数据库配置
DB_HOST=localhost
DB_PORT=3306
DB_USER=root
DB_PASSWORD=your_password
DB_NAME=azure_speech_keymanager

# Redis配置
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=

# 服务器配置
PORT=3001
NODE_ENV=development
```

### 系统配置
```sql
-- 冷却时间配置
INSERT INTO system_config (config_key, config_value, description) 
VALUES ('cooldown_seconds', '300', 'Default cooldown time in seconds');

-- 禁用状态码配置
INSERT INTO system_config (config_key, config_value, description) 
VALUES ('disable_codes', '401,404', 'Status codes that trigger key disable');

-- 冷却状态码配置
INSERT INTO system_config (config_key, config_value, description) 
VALUES ('cooldown_codes', '429', 'Status codes that trigger cooldown');
```

## 使用示例

### 1. 添加翻译Key
```bash
curl -X POST http://localhost:3001/api/translation/keys \
  -H "Content-Type: application/json" \
  -d '{
    "key": "your_azure_translation_key",
    "region": "global",
    "keyname": "TranslationKey-001"
  }'
```

### 2. 获取翻译Key
```bash
curl "http://localhost:3001/api/translation/keys/get?region=global"
```

### 3. 测试文字翻译
```bash
curl -X POST http://localhost:3001/api/translation/translate \
  -H "Content-Type: application/json" \
  -d '{
    "text": "Hello world",
    "from": "en",
    "to": "zh-Hans"
  }'
```

### 4. 查看翻译Key统计
```bash
curl "http://localhost:3001/api/translation/keys/stats"
```

### 5. 上传JSON文件批量创建Key ⭐ 新功能
```bash
# 获取模板
curl "http://localhost:3001/api/upload/template?type=speech"

# 上传文件
curl -X POST http://localhost:3001/api/upload/keys \
  -F "file=@speech_keys.json"

# 批量操作
curl -X POST http://localhost:3001/api/upload/bulk-operation \
  -H "Content-Type: application/json" \
  -d '{
    "operation": "enable",
    "keys": ["key1", "key2"],
    "type": "speech"
  }'
```

## 注意事项

1. **Key管理**: 翻译Key与语音Key分开管理，互不影响
2. **冷却机制**: 支持429错误的自动冷却处理
3. **日志记录**: 所有操作都有详细的日志记录
4. **并发安全**: 使用Redis锁确保并发安全
5. **错误处理**: 完善的错误处理和状态码管理
6. **文件上传**: 支持最大10MB的JSON文件上传
7. **实时创建**: 通过JSON文件创建的key立即生效，无需重启服务

## 故障排除

### 常见问题

1. **Key获取失败**
   - 检查数据库中是否有可用的翻译Key
   - 确认Key状态是否为enabled
   - 检查Redis连接是否正常

2. **翻译服务错误**
   - 验证Azure翻译Key是否有效
   - 检查网络连接
   - 确认API版本是否正确

3. **数据库连接问题**
   - 检查数据库配置
   - 确认数据库表是否已创建
   - 验证数据库用户权限

4. **文件上传问题**
   - 确认JSON文件格式正确
   - 检查文件大小是否超过10MB限制
   - 验证文件编码为UTF-8

### 日志查看
```bash
# 查看应用日志
tail -f logs/app.log

# 查看错误日志
tail -f logs/error.log
```

## 更新日志

### v1.1.0
- 添加JSON文件上传功能
- 支持批量创建语音和翻译key
- 添加批量操作功能（启用、禁用、删除）
- 提供JSON模板下载
- 添加文件格式验证

### v1.0.0
- 添加文字翻译功能
- 添加语音翻译功能
- 实现翻译Key管理
- 添加客户端测试脚本
- 完善API文档
