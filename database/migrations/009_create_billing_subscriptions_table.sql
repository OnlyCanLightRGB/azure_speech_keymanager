-- Migration: 009_create_billing_subscriptions_table.sql
-- Description: Create billing_subscriptions table for traditional subscription mode
-- Created: 2025-09-29

CREATE TABLE IF NOT EXISTS `billing_subscriptions` (
  `id` int NOT NULL AUTO_INCREMENT,
  `subscription_id` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci NOT NULL,
  `subscription_name` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci NOT NULL,
  `tenant_id` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci DEFAULT NULL,
  `status` enum('active','inactive','suspended') CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci NOT NULL DEFAULT 'active',
  `auto_query_enabled` tinyint(1) NOT NULL DEFAULT '1',
  `query_interval_hours` int NOT NULL DEFAULT '24',
  `last_query_time` timestamp NULL DEFAULT NULL,
  `next_query_time` timestamp NULL DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`) USING BTREE,
  UNIQUE KEY `unique_subscription_id` (`subscription_id`) USING BTREE,
  KEY `idx_status` (`status`) USING BTREE,
  KEY `idx_auto_query_enabled` (`auto_query_enabled`) USING BTREE,
  KEY `idx_next_query_time` (`next_query_time`) USING BTREE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci COMMENT='传统订阅模式的订阅管理表';