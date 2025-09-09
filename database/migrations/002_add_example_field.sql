-- Migration: 002_add_example_field.sql
-- Description: Example migration - Add example fields to demonstrate migration system
-- Created: 2024-01-01
-- Note: This is an example migration to show how to add new columns

-- Add example field to azure_keys table (commented out as example)
-- ALTER TABLE `azure_keys` ADD COLUMN `example_field` varchar(100) DEFAULT NULL AFTER `protection_end_time`;

-- Add example field to translation_keys table (commented out as example)
-- ALTER TABLE `translation_keys` ADD COLUMN `example_field` varchar(100) DEFAULT NULL AFTER `protection_end_time`;

-- Add new system configuration (example)
INSERT IGNORE INTO `system_config` (`config_key`, `config_value`, `description`) VALUES
('migration_system_enabled', 'true', 'Indicates that the migration system is active');

-- Example of creating a new table
-- CREATE TABLE IF NOT EXISTS `example_table` (
--   `id` int(11) NOT NULL AUTO_INCREMENT,
--   `name` varchar(255) NOT NULL,
--   `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
--   PRIMARY KEY (`id`)
-- ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;