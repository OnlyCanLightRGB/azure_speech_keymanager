-- 创建账单历史记录表
-- Migration: 006_create_billing_history_tables.sql
-- Created: 2025-09-22 21:32:33

CREATE TABLE IF NOT EXISTS `billing_history` (
  `id` int NOT NULL AUTO_INCREMENT,
  `subscription_id` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci NOT NULL,
  `query_date` date NOT NULL,
  `period_start` date NOT NULL,
  `period_end` date NOT NULL,
  `total_cost` decimal(15,4) NOT NULL DEFAULT '0.0000',
  `currency` varchar(10) CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci NOT NULL DEFAULT 'USD',
  `speech_cost` decimal(15,4) NOT NULL DEFAULT '0.0000',
  `translation_cost` decimal(15,4) NOT NULL DEFAULT '0.0000',
  `other_cost` decimal(15,4) NOT NULL DEFAULT '0.0000',
  `usage_count` int NOT NULL DEFAULT '0',
  `resource_count` int NOT NULL DEFAULT '0',
  `raw_data` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci COMMENT '原始JSON数据',
  `anomalies_detected` tinyint(1) NOT NULL DEFAULT '0',
  `anomaly_details` text CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci,
  `query_status` enum('success','failed','partial') CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci NOT NULL DEFAULT 'success',
  `error_message` text CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci,
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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci COMMENT='账单历史记录表';