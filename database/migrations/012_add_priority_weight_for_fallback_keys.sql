-- Migration: 012_add_priority_weight_for_fallback_keys.sql
-- Description: Add priority_weight field to support fallback key functionality
-- Created: 2025-09-30
-- Purpose: Add priority_weight field to azure_keys and translation_keys tables
--          priority_weight > 0: normal keys (default: 1)
--          priority_weight = 0: fallback keys

-- Add priority_weight field to azure_keys table
ALTER TABLE `azure_keys` 
ADD COLUMN `priority_weight` int(11) NOT NULL DEFAULT 1 COMMENT '权值：1=普通key，0=保底key' 
AFTER `error_count`;

-- Add priority_weight field to translation_keys table
ALTER TABLE `translation_keys` 
ADD COLUMN `priority_weight` int(11) NOT NULL DEFAULT 1 COMMENT '权值：1=普通key，0=保底key' 
AFTER `error_count`;

-- Add indexes for better query performance
-- Index for azure_keys: status + region + priority_weight for efficient key selection
ALTER TABLE `azure_keys` 
ADD INDEX `idx_status_region_priority` (`status` ASC, `region` ASC, `priority_weight` DESC, `id` ASC);

-- Index for translation_keys: status + region + priority_weight for efficient key selection
ALTER TABLE `translation_keys` 
ADD INDEX `idx_status_region_priority` (`status` ASC, `region` ASC, `priority_weight` DESC, `id` ASC);

-- Add separate index for fallback keys only
ALTER TABLE `azure_keys` 
ADD INDEX `idx_fallback_keys` (`priority_weight` ASC, `status` ASC, `region` ASC);

ALTER TABLE `translation_keys` 
ADD INDEX `idx_fallback_keys` (`priority_weight` ASC, `status` ASC, `region` ASC);

-- Insert configuration to track fallback key feature
INSERT INTO `system_config` (`config_key`, `config_value`, `description`) 
VALUES ('fallback_key_feature', 'enabled', 'Fallback key functionality enabled')
ON DUPLICATE KEY UPDATE 
  `config_value` = 'enabled',
  `description` = 'Fallback key functionality enabled',
  `updated_at` = CURRENT_TIMESTAMP;

-- Add configuration for fallback key behavior
INSERT INTO `system_config` (`config_key`, `config_value`, `description`) 
VALUES ('fallback_key_priority_threshold', '0', 'Priority threshold for fallback keys (0 = fallback, >0 = normal)')
ON DUPLICATE KEY UPDATE 
  `config_value` = '0',
  `description` = 'Priority threshold for fallback keys (0 = fallback, >0 = normal)',
  `updated_at` = CURRENT_TIMESTAMP;

-- Add configuration for fallback key logging
INSERT INTO `system_config` (`config_key`, `config_value`, `description`) 
VALUES ('fallback_key_detailed_logging', 'true', 'Enable detailed logging when fallback keys are used')
ON DUPLICATE KEY UPDATE 
  `config_value` = 'true',
  `description` = 'Enable detailed logging when fallback keys are used',
  `updated_at` = CURRENT_TIMESTAMP;
