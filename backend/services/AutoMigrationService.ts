import { Pool } from 'mysql2/promise';
import { MigrationManager } from '../database/MigrationManager';
import logger from '../utils/logger';
import * as fs from 'fs';
import * as path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

export interface MigrationAlert {
  type: 'success' | 'warning' | 'error';
  message: string;
  timestamp: Date;
  details?: any;
}

export interface DockerImageInfo {
  imageId: string;
  tag: string;
  created: Date;
  size: string;
}

export interface BackupInfo {
  filename: string;
  path: string;
  size: number;
  timestamp: Date;
}

/**
 * 自动迁移服务 - 处理Docker镜像切换时的数据库迁移
 * 
 * 功能说明：
 * 1. Docker镜像切换检测：当应用容器使用新的镜像启动时，自动检测版本变化
 * 2. 数据库结构检测：比较当前数据库结构与期望结构的差异
 * 3. 自动备份：在执行迁移前自动备份数据库
 * 4. 自动迁移：执行必要的数据库结构更新
 * 5. 报警机制：迁移失败时发送报警通知
 */
export class AutoMigrationService {
  private pool: Pool;
  private migrationManager: MigrationManager;
  private backupDir: string;
  private alertCallbacks: ((alert: MigrationAlert) => void)[] = [];

  constructor(pool: Pool, backupDir?: string) {
    this.pool = pool;
    this.migrationManager = new MigrationManager(pool);
    this.backupDir = backupDir || path.join(__dirname, '../../backups');
    
    // 确保备份目录存在
    if (!fs.existsSync(this.backupDir)) {
      fs.mkdirSync(this.backupDir, { recursive: true });
    }
  }

  /**
   * 注册报警回调函数
   */
  public onAlert(callback: (alert: MigrationAlert) => void): void {
    this.alertCallbacks.push(callback);
  }

  /**
   * 发送报警
   */
  private async sendAlert(alert: MigrationAlert): Promise<void> {
    logger.info(`Migration Alert [${alert.type}]: ${alert.message}`);
    
    // 调用所有注册的报警回调
    for (const callback of this.alertCallbacks) {
      try {
        callback(alert);
      } catch (error) {
        logger.error('Error in alert callback:', error);
      }
    }
  }

  /**
   * 获取当前Docker镜像信息
   */
  private async getCurrentDockerImage(): Promise<DockerImageInfo | null> {
    try {
      // 在容器内部，可以通过环境变量或文件获取镜像信息
      const { stdout } = await execAsync('cat /proc/self/cgroup | head -1 | cut -d/ -f3');
      const containerId = stdout.trim();
      
      if (containerId) {
        // 尝试获取镜像信息（需要Docker socket访问权限）
        try {
          const { stdout: imageInfo } = await execAsync(`docker inspect ${containerId} --format='{{.Config.Image}}'`);
          return {
            imageId: containerId.substring(0, 12),
            tag: imageInfo.trim(),
            created: new Date(),
            size: 'unknown'
          };
        } catch (dockerError) {
          // 如果无法访问Docker，使用环境变量或其他方式
          return {
            imageId: process.env.IMAGE_VERSION || 'unknown',
            tag: process.env.IMAGE_TAG || 'latest',
            created: new Date(),
            size: 'unknown'
          };
        }
      }
      
      return null;
    } catch (error) {
      logger.warn('Could not detect Docker image info:', error);
      return null;
    }
  }

  /**
   * 检测是否需要迁移
   */
  private async needsMigration(): Promise<boolean> {
    try {
      const status = await this.migrationManager.getMigrationStatus();
      return status.pending.length > 0;
    } catch (error) {
      logger.error('Error checking migration status:', error);
      return false;
    }
  }

  /**
   * 创建数据库备份
   */
  private async createDatabaseBackup(): Promise<BackupInfo> {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `backup_${timestamp}.sql`;
    const backupPath = path.join(this.backupDir, filename);
    
    try {
      const dbConfig = {
        host: process.env.DB_HOST || 'localhost',
        port: process.env.DB_PORT || '3306',
        user: process.env.DB_USER || 'root',
        password: process.env.DB_PASSWORD || '',
        database: process.env.DB_NAME || 'azure_speech_keymanager'
      };

      // 使用mysqldump创建备份
      const command = `mysqldump -h ${dbConfig.host} -P ${dbConfig.port} -u ${dbConfig.user} -p${dbConfig.password} ${dbConfig.database} > ${backupPath}`;
      
      await execAsync(command);
      
      const stats = fs.statSync(backupPath);
      
      const backupInfo: BackupInfo = {
        filename,
        path: backupPath,
        size: stats.size,
        timestamp: new Date()
      };

      logger.info(`Database backup created: ${filename} (${stats.size} bytes)`);
      
      await this.sendAlert({
        type: 'success',
        message: `数据库备份创建成功: ${filename}`,
        timestamp: new Date(),
        details: backupInfo
      });

      return backupInfo;
    } catch (error: any) {
      logger.error('Failed to create database backup:', error);
      
      await this.sendAlert({
        type: 'error',
        message: `数据库备份失败: ${error.message}`,
        timestamp: new Date(),
        details: { error: error.message }
      });
      
      throw error;
    }
  }

  /**
   * 执行自动迁移
   */
  public async executeAutoMigration(): Promise<void> {
    logger.info('Starting automatic migration process...');
    
    try {
      // 1. 检测Docker镜像信息
      const imageInfo = await this.getCurrentDockerImage();
      if (imageInfo) {
        logger.info(`Current Docker image: ${imageInfo.tag} (${imageInfo.imageId})`);
      }

      // 2. 检查是否需要迁移
      const needsMigration = await this.needsMigration();
      if (!needsMigration) {
        logger.info('No migrations needed, database is up to date.');
        return;
      }

      await this.sendAlert({
        type: 'warning',
        message: '检测到需要执行数据库迁移',
        timestamp: new Date(),
        details: { imageInfo }
      });

      // 3. 创建数据库备份
      logger.info('Creating database backup before migration...');
      const backupInfo = await this.createDatabaseBackup();

      // 4. 执行迁移
      logger.info('Executing database migrations...');
      await this.migrationManager.runMigrationsWithCompatibilityCheck();

      // 5. 验证迁移结果
      const finalStatus = await this.migrationManager.getMigrationStatus();
      if (finalStatus.pending.length === 0) {
        await this.sendAlert({
          type: 'success',
          message: `数据库迁移成功完成，共应用 ${finalStatus.applied} 个迁移`,
          timestamp: new Date(),
          details: {
            totalMigrations: finalStatus.total,
            appliedMigrations: finalStatus.applied,
            backupInfo
          }
        });
        
        logger.info('Automatic migration completed successfully!');
      } else {
        throw new Error(`Migration incomplete, ${finalStatus.pending.length} migrations still pending`);
      }

    } catch (error: any) {
      logger.error('Automatic migration failed:', error);
      
      await this.sendAlert({
        type: 'error',
        message: `自动迁移失败: ${error.message}`,
        timestamp: new Date(),
        details: {
          error: error.message,
          stack: error.stack
        }
      });
      
      throw error;
    }
  }

  /**
   * 检查数据库连接和基本状态
   */
  public async checkDatabaseHealth(): Promise<boolean> {
    try {
      const connection = await this.pool.getConnection();
      await connection.execute('SELECT 1');
      connection.release();
      return true;
    } catch (error) {
      logger.error('Database health check failed:', error);
      return false;
    }
  }

  /**
   * 获取迁移状态报告
   */
  public async getMigrationReport(): Promise<any> {
    try {
      const status = await this.migrationManager.getMigrationStatus();
      const imageInfo = await this.getCurrentDockerImage();
      const isHealthy = await this.checkDatabaseHealth();
      
      return {
        timestamp: new Date(),
        database: {
          healthy: isHealthy,
          migrations: status
        },
        docker: {
          image: imageInfo
        },
        backupDirectory: this.backupDir
      };
    } catch (error: any) {
      logger.error('Error generating migration report:', error);
      throw error;
    }
  }
}