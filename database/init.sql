SET NAMES utf8mb4;
SET character_set_client = utf8mb4;
SET character_set_connection = utf8mb4;
SET character_set_database = utf8mb4;
SET character_set_results = utf8mb4;
SET character_set_server = utf8mb4;
SET collation_connection = utf8mb4_general_ci;
SET collation_database = utf8mb4_general_ci;
SET collation_server = utf8mb4_general_ci;
SET FOREIGN_KEY_CHECKS = 0;

-- ----------------------------
-- Table structure for azure_keys
-- ----------------------------
CREATE TABLE IF NOT EXISTS `azure_keys`  (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `key` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci NOT NULL,
  `region` varchar(50) CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci NOT NULL,
  `keyname` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci NOT NULL DEFAULT '',
  `status` enum('enabled','disabled','cooldown') CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci NOT NULL DEFAULT 'enabled',
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `last_used` timestamp NULL DEFAULT NULL,
  `usage_count` int(11) NOT NULL DEFAULT 0,
  `error_count` int(11) NOT NULL DEFAULT 0,
  PRIMARY KEY (`id`) USING BTREE,
  UNIQUE INDEX `key`(`key` ASC) USING BTREE,
  INDEX `idx_status_region`(`status` ASC, `region` ASC) USING BTREE,
  INDEX `idx_region`(`region` ASC) USING BTREE,
  INDEX `idx_status`(`status` ASC) USING BTREE
) ENGINE = InnoDB AUTO_INCREMENT = 10 CHARACTER SET = utf8mb4 COLLATE = utf8mb4_general_ci;

-- ----------------------------
-- Table structure for translation_keys
-- ----------------------------
CREATE TABLE IF NOT EXISTS `translation_keys`  (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `key` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci NOT NULL,
  `region` varchar(50) CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci NOT NULL,
  `keyname` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci NOT NULL DEFAULT '',
  `status` enum('enabled','disabled','cooldown') CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci NOT NULL DEFAULT 'enabled',
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `last_used` timestamp NULL DEFAULT NULL,
  `usage_count` int(11) NOT NULL DEFAULT 0,
  `error_count` int(11) NOT NULL DEFAULT 0,
  PRIMARY KEY (`id`) USING BTREE,
  UNIQUE INDEX `key`(`key` ASC) USING BTREE,
  INDEX `idx_status_region`(`status` ASC, `region` ASC) USING BTREE,
  INDEX `idx_region`(`region` ASC) USING BTREE,
  INDEX `idx_status`(`status` ASC) USING BTREE
) ENGINE = InnoDB AUTO_INCREMENT = 1 CHARACTER SET = utf8mb4 COLLATE = utf8mb4_general_ci;

-- ----------------------------
-- Table structure for key_logs
-- ----------------------------
CREATE TABLE IF NOT EXISTS `key_logs`  (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `key_id` int(11) NULL DEFAULT NULL,
  `action` enum('get_key','set_status','add_key','delete_key','disable_key','enable_key','test_key','cooldown_start','cooldown_end') CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci NOT NULL,
  `status_code` int(11) DEFAULT NULL,
  `note` text CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `ip_address` varchar(45) CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci NULL DEFAULT NULL,
  `user_agent` text CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci NULL,
  PRIMARY KEY (`id`) USING BTREE,
  INDEX `idx_created_at`(`created_at` ASC) USING BTREE,
  INDEX `idx_action`(`action` ASC) USING BTREE,
  INDEX `idx_key_id`(`key_id` ASC) USING BTREE,
  CONSTRAINT `key_logs_ibfk_1` FOREIGN KEY (`key_id`) REFERENCES `azure_keys` (`id`) ON DELETE SET NULL ON UPDATE RESTRICT
) ENGINE = InnoDB AUTO_INCREMENT = 56028 CHARACTER SET = utf8mb4 COLLATE = utf8mb4_general_ci;

-- ----------------------------
-- Table structure for translation_key_logs
-- ----------------------------
CREATE TABLE IF NOT EXISTS `translation_key_logs`  (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `key_id` int(11) NULL DEFAULT NULL,
  `action` enum('get_key','set_status','add_key','delete_key','disable_key','enable_key','test_key','cooldown_start','cooldown_end') CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci NOT NULL,
  `status_code` int(11) DEFAULT NULL,
  `note` text CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `ip_address` varchar(45) CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci NULL DEFAULT NULL,
  `user_agent` text CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci NULL,
  PRIMARY KEY (`id`) USING BTREE,
  INDEX `idx_created_at`(`created_at` ASC) USING BTREE,
  INDEX `idx_action`(`action` ASC) USING BTREE,
  INDEX `idx_key_id`(`key_id` ASC) USING BTREE,
  CONSTRAINT `translation_key_logs_ibfk_1` FOREIGN KEY (`key_id`) REFERENCES `translation_keys` (`id`) ON DELETE SET NULL ON UPDATE RESTRICT
) ENGINE = InnoDB AUTO_INCREMENT = 1 CHARACTER SET = utf8mb4 COLLATE = utf8mb4_general_ci;

-- ----------------------------
-- Table structure for system_config
-- ----------------------------
CREATE TABLE IF NOT EXISTS `system_config`  (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `config_key` varchar(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci NOT NULL,
  `config_value` text CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci NOT NULL,
  `description` text CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci NULL,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`) USING BTREE,
  UNIQUE INDEX `config_key`(`config_key` ASC) USING BTREE
) ENGINE = InnoDB AUTO_INCREMENT = 798 CHARACTER SET = utf8mb4 COLLATE = utf8mb4_general_ci;

-- ----------------------------
-- Records of system_config
-- ----------------------------
INSERT IGNORE INTO `system_config` VALUES (1, 'cooldown_seconds', '10', 'Default cooldown time in seconds', '2025-06-13 10:36:45');
INSERT IGNORE INTO `system_config` VALUES (2, 'disable_codes', '401,404', 'Status codes that trigger key disable', '2025-06-11 07:20:53');
INSERT IGNORE INTO `system_config` VALUES (3, 'cooldown_codes', '429', 'Status codes that trigger cooldown', '2025-06-11 07:20:53');
INSERT IGNORE INTO `system_config` VALUES (4, 'max_concurrent_requests', '10000', 'Maximum concurrent requests', '2025-06-11 11:40:56');

-- ----------------------------
-- Table structure for json_billing_configs
-- ----------------------------
CREATE TABLE IF NOT EXISTS `json_billing_configs` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `config_name` varchar(255) NOT NULL,
  `file_name` varchar(255) NOT NULL,
  `file_path` varchar(500) NOT NULL,
  `app_id` varchar(255) NOT NULL,
  `tenant_id` varchar(255) NOT NULL,
  `display_name` varchar(255) NOT NULL,
  `password` text NOT NULL,
  `auto_query_enabled` boolean NOT NULL DEFAULT false,
  `query_interval_minutes` int(11) NOT NULL DEFAULT 1440,
  `last_query_time` timestamp NULL DEFAULT NULL,
  `next_query_time` timestamp NULL DEFAULT NULL,
  `status` enum('active','inactive','error') NOT NULL DEFAULT 'active',
  `error_message` text DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `unique_config_name` (`config_name`),
  KEY `idx_auto_query_enabled` (`auto_query_enabled`),
  KEY `idx_next_query_time` (`next_query_time`),
  KEY `idx_status` (`status`),
  KEY `idx_app_id` (`app_id`),
  KEY `idx_tenant_id` (`tenant_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ----------------------------
-- Table structure for json_billing_history
-- ----------------------------
CREATE TABLE IF NOT EXISTS `json_billing_history` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `file_name` varchar(255) NOT NULL,
  `file_path` varchar(500) NOT NULL,
  `app_id` varchar(255) NOT NULL,
  `tenant_id` varchar(255) NOT NULL,
  `display_name` varchar(255) NOT NULL,
  `query_date` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `subscription_id` varchar(255) DEFAULT NULL,
  `total_cost` decimal(10,4) DEFAULT NULL,
  `currency` varchar(10) DEFAULT NULL,
  `billing_data` longtext DEFAULT NULL,
  `query_status` enum('success','failed','no_subscription') NOT NULL DEFAULT 'no_subscription',
  `error_message` text DEFAULT NULL,
  `last_modified` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_file_name` (`file_name`),
  KEY `idx_app_id` (`app_id`),
  KEY `idx_tenant_id` (`tenant_id`),
  KEY `idx_query_date` (`query_date`),
  KEY `idx_query_status` (`query_status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ----------------------------
-- Table structure for json_billing_schedules
-- ----------------------------
CREATE TABLE IF NOT EXISTS `json_billing_schedules` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `config_id` int(11) NOT NULL,
  `scheduled_time` timestamp NOT NULL,
  `execution_time` timestamp NULL DEFAULT NULL,
  `status` enum('pending','running','completed','failed') NOT NULL DEFAULT 'pending',
  `result_message` text DEFAULT NULL,
  `billing_history_id` int(11) DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `fk_schedules_config_id` (`config_id`),
  KEY `fk_schedules_billing_history_id` (`billing_history_id`),
  KEY `idx_scheduled_time` (`scheduled_time`),
  KEY `idx_status` (`status`),
  CONSTRAINT `fk_schedules_config_id` FOREIGN KEY (`config_id`) REFERENCES `json_billing_configs` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_schedules_billing_history_id` FOREIGN KEY (`billing_history_id`) REFERENCES `json_billing_history` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ----------------------------
-- Records of system_config for JSON billing
-- ----------------------------
INSERT IGNORE INTO `system_config` VALUES (5, 'json_billing_default_interval_minutes', '1440', 'Default interval in minutes for JSON billing auto-query', NOW());
INSERT IGNORE INTO `system_config` VALUES (6, 'json_billing_max_configs', '50', 'Maximum number of JSON billing configurations allowed', NOW());
INSERT IGNORE INTO `system_config` VALUES (7, 'json_billing_scheduler_enabled', 'true', 'Enable/disable JSON billing scheduler', NOW());
INSERT IGNORE INTO `system_config` VALUES (8, 'json_billing_concurrent_queries', '3', 'Maximum concurrent JSON billing queries', NOW());

SET FOREIGN_KEY_CHECKS = 1;
