import mysql from 'mysql2/promise';
import { DatabaseConfig } from '../types';
import logger from '../utils/logger';
import { MigrationManager } from './MigrationManager';

class DatabaseConnection {
  private pool: mysql.Pool | null = null;
  private config: DatabaseConfig;

  constructor(config: DatabaseConfig) {
    this.config = config;
  }

  async initialize(): Promise<void> {
    try {
      this.pool = mysql.createPool({
        host: this.config.host,
        port: this.config.port,
        user: this.config.user,
        password: this.config.password,
        database: this.config.database,
        waitForConnections: true,
        connectionLimit: 10,
        queueLimit: 0,
        charset: 'utf8mb4'
      });

      // Test connection
      const connection = await this.pool.getConnection();
      await connection.ping();
      connection.release();
      
      logger.info('Database connection established successfully');
      
      // Initialize tables
      await this.initializeTables();
    } catch (error) {
      logger.error('Failed to initialize database connection:', error);
      throw error;
    }
  }

  private async initializeTables(): Promise<void> {
    try {
      logger.info('Initializing database with migration system...');
      
      // 使用增强的迁移系统初始化数据库（支持MySQL 5.7兼容性检测）
      const migrationManager = new MigrationManager(this.pool!);
      await migrationManager.runMigrationsWithCompatibilityCheck();
      
      logger.info('Database initialization completed successfully');
    } catch (error) {
      logger.error('Error initializing database:', error);
      
      // 如果迁移失败，回退到传统初始化方式
      logger.info('Falling back to legacy initialization...');
      await this.legacyInitializeTables();
    }
  }

  /**
   * 传统的数据库初始化方式（作为备用）
   */
  private async legacyInitializeTables(): Promise<void> {
    if (!this.pool) {
      throw new Error('Database pool not initialized');
    }

    const createTablesSQL = `
      CREATE TABLE IF NOT EXISTS azure_keys (
        id INT AUTO_INCREMENT PRIMARY KEY,
        \`key\` VARCHAR(255) NOT NULL UNIQUE,
        region VARCHAR(50) NOT NULL,
        keyname VARCHAR(255) NOT NULL DEFAULT '',
        status ENUM('enabled', 'disabled', 'cooldown') NOT NULL DEFAULT 'enabled',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        last_used TIMESTAMP NULL,
        usage_count INT DEFAULT 0,
        error_count INT DEFAULT 0,
        last_error TEXT,
        last_error_time TIMESTAMP NULL,
        protection_end_time TIMESTAMP NULL,
        INDEX idx_status_region (status, region),
        INDEX idx_region (region),
        INDEX idx_status (status)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

      CREATE TABLE IF NOT EXISTS translation_keys (
        id INT AUTO_INCREMENT PRIMARY KEY,
        \`key\` VARCHAR(255) NOT NULL UNIQUE,
        region VARCHAR(50) NOT NULL,
        keyname VARCHAR(255) NOT NULL DEFAULT '',
        status ENUM('enabled', 'disabled', 'cooldown') NOT NULL DEFAULT 'enabled',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        last_used TIMESTAMP NULL,
        usage_count INT DEFAULT 0,
        error_count INT DEFAULT 0,
        last_error TEXT,
        last_error_time TIMESTAMP NULL,
        protection_end_time TIMESTAMP NULL,
        INDEX idx_status_region (status, region),
        INDEX idx_region (region),
        INDEX idx_status (status)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

      CREATE TABLE IF NOT EXISTS key_logs (
        id INT AUTO_INCREMENT PRIMARY KEY,
        key_id INT,
        action ENUM('get_key', 'set_status', 'add_key', 'delete_key', 'disable_key', 'enable_key', 'test_key', 'cooldown_start', 'cooldown_end') NOT NULL,
        status_code INT NULL,
        note TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        ip_address VARCHAR(45),
        user_agent TEXT,
        FOREIGN KEY (key_id) REFERENCES azure_keys(id) ON DELETE SET NULL,
        INDEX idx_created_at (created_at),
        INDEX idx_action (action),
        INDEX idx_key_id (key_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

      CREATE TABLE IF NOT EXISTS translation_key_logs (
        id INT AUTO_INCREMENT PRIMARY KEY,
        key_id INT,
        action ENUM('get_key', 'set_status', 'add_key', 'delete_key', 'disable_key', 'enable_key', 'test_key', 'cooldown_start', 'cooldown_end') NOT NULL,
        status_code INT NULL,
        note TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        ip_address VARCHAR(45),
        user_agent TEXT,
        FOREIGN KEY (key_id) REFERENCES translation_keys(id) ON DELETE SET NULL,
        INDEX idx_created_at (created_at),
        INDEX idx_action (action),
        INDEX idx_key_id (key_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

      CREATE TABLE IF NOT EXISTS system_config (
        id INT AUTO_INCREMENT PRIMARY KEY,
        config_key VARCHAR(100) NOT NULL UNIQUE,
        config_value TEXT NOT NULL,
        description TEXT,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `;

    try {
      const statements = createTablesSQL.split(';').filter(stmt => stmt.trim());
      for (const statement of statements) {
        if (statement.trim()) {
          await this.pool.execute(statement);
        }
      }
      
      // Insert default configuration
      await this.insertDefaultConfig();
      
      logger.info('Database tables initialized successfully (legacy mode)');
    } catch (error) {
      logger.error('Failed to initialize database tables:', error);
      throw error;
    }
  }

  private async insertDefaultConfig(): Promise<void> {
    if (!this.pool) return;

    const defaultConfigs = [
      { key: 'cooldown_seconds', value: '10', description: 'Default cooldown time in seconds' },
      { key: 'disable_codes', value: '401,404', description: 'Status codes that trigger key disable' },
      { key: 'cooldown_codes', value: '429', description: 'Status codes that trigger cooldown' },
      { key: 'max_concurrent_requests', value: '10', description: 'Maximum concurrent requests' }
    ];

    for (const config of defaultConfigs) {
      try {
        await this.pool.execute(
          'INSERT IGNORE INTO system_config (config_key, config_value, description) VALUES (?, ?, ?)',
          [config.key, config.value, config.description]
        );
      } catch (error) {
        logger.warn(`Failed to insert default config ${config.key}:`, error);
      }
    }
  }

  getPool(): mysql.Pool {
    if (!this.pool) {
      throw new Error('Database pool not initialized');
    }
    return this.pool;
  }

  async close(): Promise<void> {
    if (this.pool) {
      await this.pool.end();
      this.pool = null;
      logger.info('Database connection closed');
    }
  }
}

export default DatabaseConnection;
