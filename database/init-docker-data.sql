-- Docker初始化数据脚本
-- 确保Docker启动时有基本的配置和示例数据

-- 插入基本系统配置
INSERT IGNORE INTO system_config (config_key, config_value, description, created_at, updated_at) VALUES
('max_requests_per_minute', '60', '每分钟最大请求数限制', NOW(), NOW()),
('cooldown_duration_minutes', '5', '密钥冷却时间（分钟）', NOW(), NOW()),
('auto_disable_on_error', 'true', '错误时自动禁用密钥', NOW(), NOW()),
('error_threshold', '3', '错误阈值，超过此数量将禁用密钥', NOW(), NOW()),
('log_retention_days', '30', '日志保留天数', NOW(), NOW()),
('enable_feishu_notifications', 'false', '启用飞书通知', NOW(), NOW()),
('feishu_webhook_url', '', '飞书Webhook URL', NOW(), NOW()),
('translation_feishu_webhook_url', '', '翻译服务飞书Webhook URL', NOW(), NOW()),
('enable_auto_key_rotation', 'false', '启用自动密钥轮换', NOW(), NOW()),
('key_rotation_interval_hours', '24', '密钥轮换间隔（小时）', NOW(), NOW()),
('enable_usage_analytics', 'true', '启用使用情况分析', NOW(), NOW()),
('max_concurrent_requests', '10', '最大并发请求数', NOW(), NOW()),
('request_timeout_seconds', '30', '请求超时时间（秒）', NOW(), NOW()),
('enable_rate_limiting', 'true', '启用速率限制', NOW(), NOW()),
('default_region', 'eastasia', '默认区域', NOW(), NOW());

-- 插入示例Azure密钥配置（如果不存在）
-- 注意：这些是示例密钥，实际使用时需要替换为真实的密钥
INSERT IGNORE INTO azure_keys (id, `key`, region, keyname, status, created_at, updated_at) VALUES
(1, 'example_key_1', 'eastasia', 'Example Key 1', 'disabled', NOW(), NOW()),
(2, 'example_key_2', 'southeastasia', 'Example Key 2', 'disabled', NOW(), NOW()),
(3, 'example_key_3', 'eastus', 'Example Key 3', 'disabled', NOW(), NOW());

-- 插入示例翻译密钥配置（如果不存在）
INSERT IGNORE INTO translation_keys (id, `key`, region, keyname, status, created_at, updated_at) VALUES
(1, 'example_translation_key_1', 'global', 'Example Translation Key 1', 'disabled', NOW(), NOW()),
(2, 'example_translation_key_2', 'global', 'Example Translation Key 2', 'disabled', NOW(), NOW());

-- 创建默认的账单查询配置（如果不存在）
INSERT IGNORE INTO billing_subscriptions (
    id, 
    subscription_id, 
    config_name, 
    client_id, 
    client_secret, 
    tenant_id, 
    auto_query_enabled, 
    query_interval_minutes,
    status, 
    created_at, 
    updated_at
) VALUES (
    1,
    'example-subscription-id',
    'Default Billing Config',
    'example-client-id',
    'example-client-secret',
    'example-tenant-id',
    0,
    1440,
    'inactive',
    NOW(),
    NOW()
);

-- 插入初始化日志
INSERT INTO key_logs (key_id, action, details, created_at) VALUES
(1, 'system_init', 'Docker环境初始化完成，创建示例配置', NOW());

-- 确保所有表都有正确的AUTO_INCREMENT值
ALTER TABLE azure_keys AUTO_INCREMENT = 4;
ALTER TABLE translation_keys AUTO_INCREMENT = 3;
ALTER TABLE billing_subscriptions AUTO_INCREMENT = 2;
ALTER TABLE system_config AUTO_INCREMENT = 16;

-- 创建索引以提高性能（如果不存在）
CREATE INDEX IF NOT EXISTS idx_azure_keys_status ON azure_keys(status);
CREATE INDEX IF NOT EXISTS idx_azure_keys_region ON azure_keys(region);
CREATE INDEX IF NOT EXISTS idx_translation_keys_status ON translation_keys(status);
CREATE INDEX IF NOT EXISTS idx_key_logs_created_at ON key_logs(created_at);
CREATE INDEX IF NOT EXISTS idx_key_logs_key_id ON key_logs(key_id);
CREATE INDEX IF NOT EXISTS idx_billing_results_query_date ON billing_results(query_date);
CREATE INDEX IF NOT EXISTS idx_billing_subscriptions_status ON billing_subscriptions(status);

-- 清理可能存在的重复或无效的JSON配置
-- 删除没有对应文件的配置
DELETE FROM json_billing_configs
WHERE file_path IS NOT NULL
  AND file_path != ''
  AND NOT EXISTS (
    SELECT 1 FROM DUAL
    WHERE file_path LIKE '/app/json/%'
  );

-- 重置所有JSON配置的定时器状态，让服务重新初始化
UPDATE json_billing_configs
SET next_query_time = CASE
  WHEN auto_query_enabled = 1 THEN DATE_ADD(NOW(), INTERVAL query_interval_minutes MINUTE)
  ELSE NULL
END,
last_query_time = NULL,
updated_at = NOW()
WHERE status = 'active';

-- 输出初始化完成信息
SELECT 'Docker数据初始化完成' as message;
SELECT COUNT(*) as azure_keys_count FROM azure_keys;
SELECT COUNT(*) as translation_keys_count FROM translation_keys;
SELECT COUNT(*) as system_configs_count FROM system_config;
SELECT COUNT(*) as billing_configs_count FROM billing_subscriptions;
SELECT COUNT(*) as json_configs_count FROM json_billing_configs WHERE status = 'active';
