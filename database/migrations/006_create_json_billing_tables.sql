-- Migration: 006_create_json_billing_tables.sql
-- Description: Create tables for JSON billing configuration storage and auto-query functionality
-- Created: 2025-01-25

-- Create json_billing_history table (if not exists)
CREATE TABLE IF NOT EXISTS `json_billing_history` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `file_name` varchar(255) NOT NULL,
  `file_path` varchar(500) NOT NULL,
  `app_id` varchar(255) NOT NULL,
  `tenant_id` varchar(255) NOT NULL,
  `display_name` varchar(255) NOT NULL,
  `query_date` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `subscription_id` varchar(255) DEFAULT NULL,
  `total_cost` decimal(10,4) DEFAULT NULL,
  `currency` varchar(10) DEFAULT NULL,
  `billing_data` longtext DEFAULT NULL,
  `query_status` enum('success','failed','no_subscription') NOT NULL DEFAULT 'no_subscription',
  `error_message` text DEFAULT NULL,
  `last_modified` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_file_name` (`file_name`),
  KEY `idx_app_id` (`app_id`),
  KEY `idx_tenant_id` (`tenant_id`),
  KEY `idx_query_date` (`query_date`),
  KEY `idx_query_status` (`query_status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Create json_billing_configs table for storing JSON configurations
CREATE TABLE IF NOT EXISTS `json_billing_configs` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `config_name` varchar(255) NOT NULL,
  `file_name` varchar(255) NOT NULL,
  `file_path` varchar(500) NOT NULL,
  `app_id` varchar(255) NOT NULL,
  `tenant_id` varchar(255) NOT NULL,
  `display_name` varchar(255) NOT NULL,
  `password` text NOT NULL,
  `auto_query_enabled` boolean NOT NULL DEFAULT false,
  `query_interval_hours` int(11) NOT NULL DEFAULT 24,
  `last_query_time` timestamp NULL DEFAULT NULL,
  `next_query_time` timestamp NULL DEFAULT NULL,
  `status` enum('active','inactive','error') NOT NULL DEFAULT 'active',
  `error_message` text DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `unique_config_name` (`config_name`),
  KEY `idx_auto_query_enabled` (`auto_query_enabled`),
  KEY `idx_next_query_time` (`next_query_time`),
  KEY `idx_status` (`status`),
  KEY `idx_app_id` (`app_id`),
  KEY `idx_tenant_id` (`tenant_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Create json_billing_schedules table for tracking scheduled queries
CREATE TABLE IF NOT EXISTS `json_billing_schedules` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `config_id` int(11) NOT NULL,
  `scheduled_time` timestamp NOT NULL,
  `execution_time` timestamp NULL DEFAULT NULL,
  `status` enum('pending','running','completed','failed') NOT NULL DEFAULT 'pending',
  `result_message` text DEFAULT NULL,
  `billing_history_id` int(11) DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `fk_schedules_config_id` (`config_id`),
  KEY `fk_schedules_billing_history_id` (`billing_history_id`),
  KEY `idx_scheduled_time` (`scheduled_time`),
  KEY `idx_status` (`status`),
  CONSTRAINT `fk_schedules_config_id` FOREIGN KEY (`config_id`) REFERENCES `json_billing_configs` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_schedules_billing_history_id` FOREIGN KEY (`billing_history_id`) REFERENCES `json_billing_history` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Insert default system configuration for JSON billing
INSERT IGNORE INTO `system_config` (`config_key`, `config_value`, `description`) VALUES
('json_billing_default_interval_hours', '24', 'Default interval in hours for JSON billing auto-query'),
('json_billing_max_configs', '50', 'Maximum number of JSON billing configurations allowed'),
('json_billing_scheduler_enabled', 'true', 'Enable/disable JSON billing scheduler'),
('json_billing_concurrent_queries', '3', 'Maximum concurrent JSON billing queries');