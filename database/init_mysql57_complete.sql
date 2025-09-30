-- Azure Speech Key Manager Database Initialization Script
-- 完整的数据库初始化脚本，整合所有000-012 migration功能
-- 专为MySQL 5.7设计，兼容MySQL 8.0
-- Created: 2025-09-30
-- Version: 3.0 - MySQL 5.7完整整合版本
-- 
-- 整合的Migration文件：
-- 000_create_migrations_table.sql
-- 002_create_json_billing_tables.sql  
-- 003_fix_json_billing_configs_table.sql
-- 005_mysql57_compatibility.sql
-- 006_add_billing_history.sql
-- 006_add_scheduled_tasks_table.sql
-- 006_create_billing_history_tables.sql
-- 006_create_json_billing_tables.sql
-- 008_add_status_code_to_logs.sql
-- 009_create_billing_subscriptions_table.sql
-- 010_create_billing_resource_history_table.sql
-- 011_add_query_interval_minutes_to_billing_subscriptions.sql
-- 012_add_priority_weight_for_fallback_keys.sql

SET NAMES utf8mb4;
SET character_set_client = utf8mb4;
SET character_set_connection = utf8mb4;
SET character_set_database = utf8mb4;
SET character_set_results = utf8mb4;
SET character_set_server = utf8mb4;
SET collation_connection = utf8mb4_unicode_ci;
SET collation_database = utf8mb4_unicode_ci;
SET collation_server = utf8mb4_unicode_ci;
SET FOREIGN_KEY_CHECKS = 0;

-- ----------------------------
-- Table structure for database_migrations (000_create_migrations_table.sql)
-- ----------------------------
CREATE TABLE IF NOT EXISTS `database_migrations` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `migration_name` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `applied_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `checksum` varchar(64) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  PRIMARY KEY (`id`) USING BTREE,
  UNIQUE KEY `unique_migration_name` (`migration_name`) USING BTREE,
  KEY `idx_applied_at` (`applied_at`) USING BTREE
) ENGINE=InnoDB AUTO_INCREMENT = 1 CHARACTER SET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='数据库迁移记录表';

-- ----------------------------
-- Table structure for azure_keys (主表 + 012_add_priority_weight_for_fallback_keys.sql)
-- ----------------------------
CREATE TABLE IF NOT EXISTS `azure_keys` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `key` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `region` varchar(50) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `keyname` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT '',
  `status` enum('enabled','disabled','cooldown') CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'enabled',
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `last_used` timestamp NULL DEFAULT NULL,
  `usage_count` int(11) NOT NULL DEFAULT 0,
  `error_count` int(11) NOT NULL DEFAULT 0,
  `priority_weight` int(11) NOT NULL DEFAULT 1 COMMENT '权值：1=普通key，0=保底key',
  PRIMARY KEY (`id`) USING BTREE,
  UNIQUE INDEX `key`(`key` ASC) USING BTREE,
  INDEX `idx_status_region`(`status` ASC, `region` ASC) USING BTREE,
  INDEX `idx_region`(`region` ASC) USING BTREE,
  INDEX `idx_status`(`status` ASC) USING BTREE,
  INDEX `idx_status_region_priority` (`status` ASC, `region` ASC, `priority_weight` DESC, `id` ASC),
  INDEX `idx_fallback_keys` (`priority_weight` ASC, `status` ASC, `region` ASC)
) ENGINE = InnoDB AUTO_INCREMENT = 1 CHARACTER SET = utf8mb4 COLLATE = utf8mb4_unicode_ci COMMENT='Azure语音服务密钥表';

-- ----------------------------
-- Table structure for translation_keys (主表 + 012_add_priority_weight_for_fallback_keys.sql)
-- ----------------------------
CREATE TABLE IF NOT EXISTS `translation_keys` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `key` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `region` varchar(50) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `keyname` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT '',
  `status` enum('enabled','disabled','cooldown') CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'enabled',
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `last_used` timestamp NULL DEFAULT NULL,
  `usage_count` int(11) NOT NULL DEFAULT 0,
  `error_count` int(11) NOT NULL DEFAULT 0,
  `priority_weight` int(11) NOT NULL DEFAULT 1 COMMENT '权值：1=普通key，0=保底key',
  PRIMARY KEY (`id`) USING BTREE,
  UNIQUE INDEX `key`(`key` ASC) USING BTREE,
  INDEX `idx_status_region`(`status` ASC, `region` ASC) USING BTREE,
  INDEX `idx_region`(`region` ASC) USING BTREE,
  INDEX `idx_status`(`status` ASC) USING BTREE,
  INDEX `idx_status_region_priority` (`status` ASC, `region` ASC, `priority_weight` DESC, `id` ASC),
  INDEX `idx_fallback_keys` (`priority_weight` ASC, `status` ASC, `region` ASC)
) ENGINE = InnoDB AUTO_INCREMENT = 1 CHARACTER SET = utf8mb4 COLLATE = utf8mb4_unicode_ci COMMENT='Azure翻译服务密钥表';

-- ----------------------------
-- Table structure for key_logs (主表 + 008_add_status_code_to_logs.sql)
-- ----------------------------
CREATE TABLE IF NOT EXISTS `key_logs` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `key_id` int(11) NOT NULL,
  `action` ENUM('get_key', 'set_status', 'add_key', 'delete_key', 'disable_key', 'enable_key', 'test_key', 'cooldown_start', 'cooldown_end') CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `status_code` int(11) DEFAULT NULL,
  `note` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `ip_address` varchar(45) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `user_agent` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`) USING BTREE,
  INDEX `idx_key_id`(`key_id` ASC) USING BTREE,
  INDEX `idx_action`(`action` ASC) USING BTREE,
  INDEX `idx_created_at`(`created_at` ASC) USING BTREE,
  INDEX `idx_status_code`(`status_code` ASC) USING BTREE,
  CONSTRAINT `fk_key_logs_azure_keys` FOREIGN KEY (`key_id`) REFERENCES `azure_keys` (`id`) ON DELETE CASCADE ON UPDATE RESTRICT
) ENGINE = InnoDB AUTO_INCREMENT = 1 CHARACTER SET = utf8mb4 COLLATE = utf8mb4_unicode_ci COMMENT='Azure语音服务密钥操作日志表';

-- ----------------------------
-- Table structure for translation_key_logs (主表 + 008_add_status_code_to_logs.sql)
-- ----------------------------
CREATE TABLE IF NOT EXISTS `translation_key_logs` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `key_id` int(11) NOT NULL,
  `action` ENUM('get_key', 'set_status', 'add_key', 'delete_key', 'disable_key', 'enable_key', 'test_key', 'cooldown_start', 'cooldown_end') CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `status_code` int(11) DEFAULT NULL,
  `note` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `ip_address` varchar(45) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `user_agent` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`) USING BTREE,
  INDEX `idx_key_id`(`key_id` ASC) USING BTREE,
  INDEX `idx_action`(`action` ASC) USING BTREE,
  INDEX `idx_created_at`(`created_at` ASC) USING BTREE,
  INDEX `idx_status_code`(`status_code` ASC) USING BTREE,
  CONSTRAINT `fk_translation_key_logs_translation_keys` FOREIGN KEY (`key_id`) REFERENCES `translation_keys` (`id`) ON DELETE CASCADE ON UPDATE RESTRICT
) ENGINE = InnoDB AUTO_INCREMENT = 1 CHARACTER SET = utf8mb4 COLLATE = utf8mb4_unicode_ci COMMENT='Azure翻译服务密钥操作日志表';

-- ----------------------------
-- Table structure for system_config (001_fix_json_billing_configs_table.sql)
-- ----------------------------
CREATE TABLE IF NOT EXISTS `system_config` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `config_key` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `config_value` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `description` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`) USING BTREE,
  UNIQUE KEY `unique_config_key` (`config_key`) USING BTREE
) ENGINE=InnoDB AUTO_INCREMENT = 1 CHARACTER SET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='系统配置表';

-- ----------------------------
-- Table structure for json_billing_configs (002_create_json_billing_tables.sql)
-- ----------------------------
CREATE TABLE IF NOT EXISTS `json_billing_configs` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `config_name` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `file_name` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `file_path` varchar(500) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `app_id` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `tenant_id` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `display_name` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `password` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `auto_query_enabled` boolean NOT NULL DEFAULT false,
  `query_interval_minutes` int(11) NOT NULL DEFAULT 1440,
  `last_query_time` timestamp NULL DEFAULT NULL,
  `next_query_time` timestamp NULL DEFAULT NULL,
  `status` enum('active','inactive','error') CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'active',
  `error_message` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`) USING BTREE,
  UNIQUE KEY `unique_config_name` (`config_name`) USING BTREE,
  KEY `idx_auto_query_enabled` (`auto_query_enabled`) USING BTREE,
  KEY `idx_next_query_time` (`next_query_time`) USING BTREE,
  KEY `idx_status` (`status`) USING BTREE,
  KEY `idx_app_id` (`app_id`) USING BTREE,
  KEY `idx_tenant_id` (`tenant_id`) USING BTREE
) ENGINE=InnoDB AUTO_INCREMENT = 1 CHARACTER SET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='JSON账单配置表';

-- ----------------------------
-- Table structure for json_billing_history (002_create_json_billing_tables.sql)
-- ----------------------------
CREATE TABLE IF NOT EXISTS `json_billing_history` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `file_name` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `file_path` varchar(500) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `app_id` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `tenant_id` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `display_name` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `query_date` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `subscription_id` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `total_cost` decimal(10,4) DEFAULT NULL,
  `currency` varchar(10) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `billing_data` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `query_status` enum('success','failed','no_subscription') CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'no_subscription',
  `error_message` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `last_modified` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`) USING BTREE,
  KEY `idx_file_name` (`file_name`) USING BTREE,
  KEY `idx_app_id` (`app_id`) USING BTREE,
  KEY `idx_tenant_id` (`tenant_id`) USING BTREE,
  KEY `idx_query_date` (`query_date`) USING BTREE,
  KEY `idx_query_status` (`query_status`) USING BTREE
) ENGINE=InnoDB AUTO_INCREMENT = 1 CHARACTER SET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='JSON账单历史记录表';

-- ----------------------------
-- Table structure for json_billing_schedules (002_create_json_billing_tables.sql)
-- ----------------------------
CREATE TABLE IF NOT EXISTS `json_billing_schedules` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `config_id` int(11) NOT NULL,
  `scheduled_time` timestamp NULL DEFAULT NULL,
  `execution_time` timestamp NULL DEFAULT NULL,
  `status` enum('pending','running','completed','failed') CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'pending',
  `result_message` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `billing_history_id` int(11) DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`) USING BTREE,
  KEY `fk_schedules_config_id` (`config_id`) USING BTREE,
  KEY `fk_schedules_billing_history_id` (`billing_history_id`) USING BTREE,
  KEY `idx_scheduled_time` (`scheduled_time`) USING BTREE,
  KEY `idx_status` (`status`) USING BTREE,
  CONSTRAINT `fk_schedules_config_id` FOREIGN KEY (`config_id`) REFERENCES `json_billing_configs` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_schedules_billing_history_id` FOREIGN KEY (`billing_history_id`) REFERENCES `json_billing_history` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB AUTO_INCREMENT = 1 CHARACTER SET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='JSON账单调度表';

-- ----------------------------
-- Table structure for scheduled_tasks (006_add_scheduled_tasks_table.sql)
-- ----------------------------
CREATE TABLE IF NOT EXISTS `scheduled_tasks` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `task_name` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `task_type` enum('billing_query','key_cleanup','log_cleanup','health_check') CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `schedule_expression` varchar(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL COMMENT 'Cron表达式',
  `is_enabled` tinyint(1) NOT NULL DEFAULT 1,
  `last_run_time` timestamp NULL DEFAULT NULL,
  `next_run_time` timestamp NULL DEFAULT NULL,
  `run_count` int(11) NOT NULL DEFAULT 0,
  `success_count` int(11) NOT NULL DEFAULT 0,
  `failure_count` int(11) NOT NULL DEFAULT 0,
  `last_result` enum('success','failure','running') CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `last_error_message` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`) USING BTREE,
  UNIQUE KEY `unique_task_name` (`task_name`) USING BTREE,
  KEY `idx_task_type` (`task_type`) USING BTREE,
  KEY `idx_is_enabled` (`is_enabled`) USING BTREE,
  KEY `idx_next_run_time` (`next_run_time`) USING BTREE
) ENGINE=InnoDB AUTO_INCREMENT = 1 CHARACTER SET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='定时任务表';

-- ----------------------------
-- Table structure for billing_subscriptions (009_create_billing_subscriptions_table.sql + 011_add_query_interval_minutes_to_billing_subscriptions.sql)
-- ----------------------------
CREATE TABLE IF NOT EXISTS `billing_subscriptions` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `subscription_id` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `subscription_name` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `tenant_id` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `is_active` tinyint(1) NOT NULL DEFAULT 1,
  `auto_query_enabled` tinyint(1) NOT NULL DEFAULT 0,
  `query_interval_minutes` int(11) NOT NULL DEFAULT 1440 COMMENT '查询间隔（分钟）',
  `last_query_time` timestamp NULL DEFAULT NULL,
  `next_query_time` timestamp NULL DEFAULT NULL,
  `total_queries` int(11) NOT NULL DEFAULT 0,
  `successful_queries` int(11) NOT NULL DEFAULT 0,
  `failed_queries` int(11) NOT NULL DEFAULT 0,
  `last_query_status` enum('success','failed','pending') CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `last_error_message` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`) USING BTREE,
  UNIQUE KEY `unique_subscription_id` (`subscription_id`) USING BTREE,
  KEY `idx_tenant_id` (`tenant_id`) USING BTREE,
  KEY `idx_is_active` (`is_active`) USING BTREE,
  KEY `idx_auto_query_enabled` (`auto_query_enabled`) USING BTREE,
  KEY `idx_next_query_time` (`next_query_time`) USING BTREE,
  KEY `idx_last_query_status` (`last_query_status`) USING BTREE
) ENGINE=InnoDB AUTO_INCREMENT = 1 CHARACTER SET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='账单订阅表';

-- ----------------------------
-- Table structure for billing_history (006_create_billing_history_tables.sql)
-- ----------------------------
CREATE TABLE IF NOT EXISTS `billing_history` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `subscription_id` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `query_date` date NOT NULL,
  `period_start` date NOT NULL,
  `period_end` date NOT NULL,
  `total_cost` decimal(15,4) NOT NULL DEFAULT '0.0000',
  `currency` varchar(10) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'USD',
  `speech_cost` decimal(15,4) NOT NULL DEFAULT '0.0000',
  `translation_cost` decimal(15,4) NOT NULL DEFAULT '0.0000',
  `other_cost` decimal(15,4) NOT NULL DEFAULT '0.0000',
  `usage_count` int(11) NOT NULL DEFAULT '0',
  `resource_count` int(11) NOT NULL DEFAULT '0',
  `raw_data` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci COMMENT '原始JSON数据',
  `anomalies_detected` tinyint(1) NOT NULL DEFAULT '0',
  `anomaly_details` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci,
  `query_status` enum('success','failed','partial') CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'success',
  `error_message` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`) USING BTREE,
  UNIQUE KEY `subscription_query_date` (`subscription_id`,`query_date`) USING BTREE,
  KEY `idx_subscription_id` (`subscription_id`) USING BTREE,
  KEY `idx_query_date` (`query_date`) USING BTREE,
  KEY `idx_period` (`period_start`,`period_end`) USING BTREE,
  KEY `idx_total_cost` (`total_cost`) USING BTREE,
  KEY `idx_query_status` (`query_status`) USING BTREE,
  KEY `idx_anomalies` (`anomalies_detected`) USING BTREE
) ENGINE=InnoDB AUTO_INCREMENT = 1 CHARACTER SET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='账单历史记录表';

-- ----------------------------
-- Table structure for billing_resource_history (010_create_billing_resource_history_table.sql)
-- ----------------------------
CREATE TABLE IF NOT EXISTS `billing_resource_history` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `subscription_id` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `resource_group` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `resource_name` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `resource_type` varchar(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `service_name` varchar(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `meter_category` varchar(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `meter_subcategory` varchar(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `meter_name` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `usage_date` date NOT NULL,
  `usage_quantity` decimal(15,6) NOT NULL DEFAULT '0.000000',
  `cost` decimal(15,4) NOT NULL DEFAULT '0.0000',
  `currency` varchar(10) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'USD',
  `unit_price` decimal(15,6) DEFAULT NULL,
  `billing_period_start` date NOT NULL,
  `billing_period_end` date NOT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`) USING BTREE,
  KEY `idx_subscription_id` (`subscription_id`) USING BTREE,
  KEY `idx_resource_name` (`resource_name`) USING BTREE,
  KEY `idx_service_name` (`service_name`) USING BTREE,
  KEY `idx_usage_date` (`usage_date`) USING BTREE,
  KEY `idx_billing_period` (`billing_period_start`,`billing_period_end`) USING BTREE,
  KEY `idx_cost` (`cost`) USING BTREE
) ENGINE=InnoDB AUTO_INCREMENT = 1 CHARACTER SET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='账单资源历史记录表';

-- ----------------------------
-- Table structure for billing_alerts (006_add_billing_history.sql)
-- ----------------------------
CREATE TABLE IF NOT EXISTS `billing_alerts` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `subscription_id` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `alert_type` enum('cost_threshold','usage_anomaly','query_failure','resource_spike') CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `severity` enum('low','medium','high','critical') CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'medium',
  `title` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `message` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `threshold_value` decimal(15,4) DEFAULT NULL,
  `actual_value` decimal(15,4) DEFAULT NULL,
  `resource_id` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `is_resolved` tinyint(1) NOT NULL DEFAULT '0',
  `resolved_at` timestamp NULL DEFAULT NULL,
  `resolved_by` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `notification_sent` tinyint(1) NOT NULL DEFAULT '0',
  `notification_sent_at` timestamp NULL DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`) USING BTREE,
  KEY `idx_subscription_id` (`subscription_id`) USING BTREE,
  KEY `idx_alert_type` (`alert_type`) USING BTREE,
  KEY `idx_severity` (`severity`) USING BTREE,
  KEY `idx_is_resolved` (`is_resolved`) USING BTREE,
  KEY `idx_created_at` (`created_at`) USING BTREE
) ENGINE=InnoDB AUTO_INCREMENT = 1 CHARACTER SET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='账单告警记录表';

-- ----------------------------
-- 系统配置数据 (整合所有migration的配置)
-- ----------------------------

-- 基础系统配置
INSERT IGNORE INTO `system_config` (`config_key`, `config_value`, `description`) VALUES
('sticky_duration_minutes', '30', 'Sticky key duration in minutes'),
('cooldown_duration_minutes', '5', 'Key cooldown duration in minutes'),
('max_error_count', '3', 'Maximum error count before key is disabled'),
('enable_key_rotation', 'true', 'Enable automatic key rotation'),
('log_retention_days', '30', 'Number of days to retain logs'),
('api_rate_limit_per_minute', '60', 'API rate limit per minute per key'),
('health_check_interval_minutes', '5', 'Health check interval in minutes'),
('backup_enabled', 'true', 'Enable automatic database backups'),
('maintenance_mode', 'false', 'System maintenance mode'),
('debug_mode', 'false', 'Enable debug logging');

-- JSON账单系统配置 (002_create_json_billing_tables.sql)
INSERT IGNORE INTO `system_config` (`config_key`, `config_value`, `description`) VALUES
('json_billing_default_interval_minutes', '1440', 'Default interval in minutes for JSON billing auto-query'),
('json_billing_max_configs', '50', 'Maximum number of JSON billing configurations allowed'),
('json_billing_scheduler_enabled', 'true', 'Enable/disable JSON billing scheduler'),
('json_billing_concurrent_queries', '3', 'Maximum concurrent JSON billing queries');

-- Migration系统配置 (002_add_example_field.sql)
INSERT IGNORE INTO `system_config` (`config_key`, `config_value`, `description`) VALUES
('migration_system_enabled', 'true', 'Indicates that the migration system is active');

-- MySQL 5.7兼容性配置 (005_mysql57_compatibility.sql)
INSERT IGNORE INTO `system_config` (`config_key`, `config_value`, `description`) VALUES
('mysql57_compatibility', 'enabled', 'MySQL 5.7 compatibility mode enabled'),
('db_compatibility_version', '5.7', 'Database compatibility version');

-- 保底密钥功能配置 (012_add_priority_weight_for_fallback_keys.sql)
INSERT IGNORE INTO `system_config` (`config_key`, `config_value`, `description`) VALUES
('fallback_key_feature', 'enabled', 'Fallback key functionality enabled'),
('fallback_key_priority_threshold', '0', 'Priority threshold for fallback keys (0 = fallback, >0 = normal)'),
('fallback_key_detailed_logging', 'true', 'Enable detailed logging when fallback keys are used');

-- ----------------------------
-- 预置迁移记录 (标记所有000-012迁移为已应用)
-- ----------------------------
INSERT IGNORE INTO `database_migrations` (`migration_name`, `applied_at`, `checksum`) VALUES
('000_create_migrations_table.sql', NOW(), 'mysql57_complete_v3'),
('001_fix_json_billing_configs_table.sql', NOW(), 'mysql57_complete_v3'),
('002_add_example_field.sql', NOW(), 'mysql57_complete_v3'),
('002_create_json_billing_tables.sql', NOW(), 'mysql57_complete_v3'),
('003_fix_json_billing_configs_table.sql', NOW(), 'mysql57_complete_v3'),
('005_mysql57_compatibility.sql', NOW(), 'mysql57_complete_v3'),
('006_add_billing_history.sql', NOW(), 'mysql57_complete_v3'),
('006_add_scheduled_tasks_table.sql', NOW(), 'mysql57_complete_v3'),
('006_create_billing_history_tables.sql', NOW(), 'mysql57_complete_v3'),
('006_create_json_billing_tables.sql', NOW(), 'mysql57_complete_v3'),
('008_add_status_code_to_logs.sql', NOW(), 'mysql57_complete_v3'),
('009_create_billing_subscriptions_table.sql', NOW(), 'mysql57_complete_v3'),
('010_create_billing_resource_history_table.sql', NOW(), 'mysql57_complete_v3'),
('011_add_query_interval_minutes_to_billing_subscriptions.sql', NOW(), 'mysql57_complete_v3'),
('012_add_priority_weight_for_fallback_keys.sql', NOW(), 'mysql57_complete_v3');

SET FOREIGN_KEY_CHECKS = 1;
