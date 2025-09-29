-- 创建账单资源历史记录表
-- Migration: 010_create_billing_resource_history_table.sql
-- Created: 2025-09-29 18:56:00

CREATE TABLE IF NOT EXISTS `billing_resource_history` (
  `id` int NOT NULL AUTO_INCREMENT,
  `billing_history_id` int NOT NULL,
  `resource_id` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci DEFAULT NULL,
  `resource_name` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci DEFAULT NULL,
  `resource_type` varchar(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci DEFAULT NULL,
  `location` varchar(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci DEFAULT NULL,
  `cost` decimal(15,4) DEFAULT NULL,
  `currency` varchar(10) CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci DEFAULT 'USD',
  `usage_breakdown` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci COMMENT '使用量详细信息JSON',
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`) USING BTREE,
  KEY `idx_billing_history_id` (`billing_history_id`) USING BTREE,
  KEY `idx_resource_id` (`resource_id`) USING BTREE,
  KEY `idx_resource_type` (`resource_type`) USING BTREE,
  KEY `idx_location` (`location`) USING BTREE,
  KEY `idx_cost` (`cost`) USING BTREE,
  CONSTRAINT `fk_billing_resource_history_billing_history` FOREIGN KEY (`billing_history_id`) REFERENCES `billing_history` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci COMMENT='账单资源历史记录表';
