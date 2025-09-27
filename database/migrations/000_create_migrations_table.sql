-- Migration: 000_create_migrations_table.sql
-- Description: Create database migrations tracking table
-- Created: 2024-01-01

-- Create database_migrations table to track applied migrations
CREATE TABLE IF NOT EXISTS `database_migrations` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `migration_name` varchar(255) NOT NULL,
  `applied_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `checksum` varchar(64) DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `unique_migration_name` (`migration_name`),
  KEY `idx_applied_at` (`applied_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;