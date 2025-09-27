-- Migration: 008_add_status_code_to_logs.sql
-- Description: Add status_code and note fields to key_logs and translation_key_logs tables
-- Created: 2025-09-27

-- Add status_code and note fields to key_logs table
ALTER TABLE `key_logs` 
ADD COLUMN `status_code` int(11) DEFAULT NULL AFTER `action`,
ADD COLUMN `note` text DEFAULT NULL AFTER `status_code`,
ADD COLUMN `ip_address` varchar(45) DEFAULT NULL AFTER `note`,
ADD COLUMN `user_agent` text DEFAULT NULL AFTER `ip_address`;

-- Add status_code and note fields to translation_key_logs table  
ALTER TABLE `translation_key_logs`
ADD COLUMN `status_code` int(11) DEFAULT NULL AFTER `action`,
ADD COLUMN `note` text DEFAULT NULL AFTER `status_code`,
ADD COLUMN `ip_address` varchar(45) DEFAULT NULL AFTER `note`,
ADD COLUMN `user_agent` text DEFAULT NULL AFTER `ip_address`;

-- Update action column to use ENUM for better consistency
ALTER TABLE `key_logs` 
MODIFY COLUMN `action` ENUM('get_key', 'set_status', 'add_key', 'delete_key', 'disable_key', 'enable_key', 'test_key', 'cooldown_start', 'cooldown_end') NOT NULL;

ALTER TABLE `translation_key_logs`
MODIFY COLUMN `action` ENUM('get_key', 'set_status', 'add_key', 'delete_key', 'disable_key', 'enable_key', 'test_key', 'cooldown_start', 'cooldown_end') NOT NULL;