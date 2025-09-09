-- Migration: 005_mysql57_compatibility.sql
-- Description: MySQL 5.7 compatibility fixes
-- Created: 2024-01-01
-- Purpose: Fix table structures that are incompatible with MySQL 5.7

-- Check if we're running on MySQL 5.7 and apply compatibility fixes
-- This migration ensures all tables work properly on MySQL 5.7

-- Fix azure_keys table for MySQL 5.7 compatibility
ALTER TABLE `azure_keys` 
  MODIFY COLUMN `created_at` TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
  MODIFY COLUMN `updated_at` TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  MODIFY COLUMN `last_used` TIMESTAMP NULL DEFAULT NULL;

-- Fix translation_keys table for MySQL 5.7 compatibility
ALTER TABLE `translation_keys` 
  MODIFY COLUMN `created_at` TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
  MODIFY COLUMN `updated_at` TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  MODIFY COLUMN `last_used` TIMESTAMP NULL DEFAULT NULL;

-- Fix key_logs table for MySQL 5.7 compatibility
ALTER TABLE `key_logs` 
  MODIFY COLUMN `created_at` TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP;

-- Fix translation_key_logs table for MySQL 5.7 compatibility
ALTER TABLE `translation_key_logs` 
  MODIFY COLUMN `created_at` TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP;

-- Fix system_config table for MySQL 5.7 compatibility
ALTER TABLE `system_config` 
  MODIFY COLUMN `updated_at` TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP;

-- Ensure proper charset and collation for MySQL 5.7
-- Convert tables to use utf8mb4 with proper collation if not already set
ALTER TABLE `azure_keys` CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
ALTER TABLE `translation_keys` CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
ALTER TABLE `key_logs` CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
ALTER TABLE `translation_key_logs` CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
ALTER TABLE `system_config` CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
ALTER TABLE `database_migrations` CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- Indexes already exist, skipping to avoid conflicts

-- Foreign key constraints already exist, skipping to avoid conflicts

-- Insert configuration to track MySQL 5.7 compatibility
INSERT INTO `system_config` (`config_key`, `config_value`, `description`) 
VALUES ('mysql57_compatibility', 'enabled', 'MySQL 5.7 compatibility mode enabled')
ON DUPLICATE KEY UPDATE 
  `config_value` = 'enabled',
  `description` = 'MySQL 5.7 compatibility mode enabled',
  `updated_at` = CURRENT_TIMESTAMP;

-- Add version tracking for compatibility
INSERT INTO `system_config` (`config_key`, `config_value`, `description`) 
VALUES ('db_compatibility_version', '5.7', 'Database compatibility version')
ON DUPLICATE KEY UPDATE 
  `config_value` = '5.7',
  `description` = 'Database compatibility version',
  `updated_at` = CURRENT_TIMESTAMP;