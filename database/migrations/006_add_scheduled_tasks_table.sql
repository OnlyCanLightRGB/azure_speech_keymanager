-- 添加定时任务配置表
-- Migration: 006_add_scheduled_tasks_table.sql
-- Created: 2025-09-25 02:50:15

CREATE TABLE IF NOT EXISTS `scheduled_tasks` (
  `id` int NOT NULL AUTO_INCREMENT,
  `task_name` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `task_type` enum('history_refresh','billing_monitor','custom','json_billing_query') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'history_refresh',
  `description` text COLLATE utf8mb4_unicode_ci,
  `interval_minutes` int NOT NULL DEFAULT '10',
  `enabled` tinyint(1) NOT NULL DEFAULT '1',
  `last_run_time` timestamp NULL DEFAULT NULL,
  `next_run_time` timestamp NULL DEFAULT NULL,
  `run_count` int NOT NULL DEFAULT '0',
  `error_count` int NOT NULL DEFAULT '0',
  `last_error` text COLLATE utf8mb4_unicode_ci,
  `config` json DEFAULT NULL COMMENT '任务配置参数',
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `task_name` (`task_name`),
  KEY `idx_task_type` (`task_type`),
  KEY `idx_enabled` (`enabled`),
  KEY `idx_next_run_time` (`next_run_time`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='定时任务配置表';