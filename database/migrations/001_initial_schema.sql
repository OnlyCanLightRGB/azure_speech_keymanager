-- Migration: 001_initial_schema.sql
-- Description: Initial database schema
-- Created: 2024-01-01

-- Create azure_keys table
CREATE TABLE IF NOT EXISTS `azure_keys` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `key` varchar(255) NOT NULL,
  `region` varchar(100) NOT NULL,
  `keyname` varchar(255) DEFAULT NULL,
  `status` enum('enabled','disabled') DEFAULT 'enabled',
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `last_used` timestamp NULL DEFAULT NULL,
  `usage_count` int(11) DEFAULT '0',
  `error_count` int(11) DEFAULT '0',
  `last_error` text,
  `last_error_time` timestamp NULL DEFAULT NULL,
  `protection_end_time` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `unique_key_region` (`key`,`region`),
  KEY `idx_status` (`status`),
  KEY `idx_last_used` (`last_used`),
  KEY `idx_protection_end_time` (`protection_end_time`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Create translation_keys table
CREATE TABLE IF NOT EXISTS `translation_keys` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `key` varchar(255) NOT NULL,
  `region` varchar(100) NOT NULL,
  `keyname` varchar(255) DEFAULT NULL,
  `status` enum('enabled','disabled') DEFAULT 'enabled',
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `last_used` timestamp NULL DEFAULT NULL,
  `usage_count` int(11) DEFAULT '0',
  `error_count` int(11) DEFAULT '0',
  `last_error` text,
  `last_error_time` timestamp NULL DEFAULT NULL,
  `protection_end_time` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `unique_key_region` (`key`,`region`),
  KEY `idx_status` (`status`),
  KEY `idx_last_used` (`last_used`),
  KEY `idx_protection_end_time` (`protection_end_time`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Create key_logs table
CREATE TABLE IF NOT EXISTS `key_logs` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `key_id` int(11) NOT NULL,
  `action` varchar(50) NOT NULL,
  `details` text,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `fk_key_logs_key_id` (`key_id`),
  KEY `idx_created_at` (`created_at`),
  CONSTRAINT `fk_key_logs_key_id` FOREIGN KEY (`key_id`) REFERENCES `azure_keys` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Create translation_key_logs table
CREATE TABLE IF NOT EXISTS `translation_key_logs` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `key_id` int(11) NOT NULL,
  `action` varchar(50) NOT NULL,
  `details` text,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `fk_translation_key_logs_key_id` (`key_id`),
  KEY `idx_created_at` (`created_at`),
  CONSTRAINT `fk_translation_key_logs_key_id` FOREIGN KEY (`key_id`) REFERENCES `translation_keys` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Create system_config table
CREATE TABLE IF NOT EXISTS `system_config` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `config_key` varchar(255) NOT NULL,
  `config_value` text NOT NULL,
  `description` text,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `unique_config_key` (`config_key`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Insert default system configuration
INSERT IGNORE INTO `system_config` (`config_key`, `config_value`, `description`) VALUES
('cooldown_seconds', '300', 'Cooldown period in seconds after key failure'),
('disable_codes', '401,403,429', 'HTTP status codes that trigger key disabling'),
('max_retries', '3', 'Maximum retry attempts for failed requests'),
('protection_period_hours', '24', 'Protection period in hours for newly added keys'),
('health_check_interval', '300', 'Health check interval in seconds'),
('log_retention_days', '30', 'Log retention period in days');