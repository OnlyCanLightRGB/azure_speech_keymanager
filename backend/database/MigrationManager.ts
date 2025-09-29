import * as fs from 'fs';
import * as path from 'path';
import { Pool, PoolConnection } from 'mysql2/promise';
import * as crypto from 'crypto';
import { AutoMigrationService, MigrationAlert } from '../services/AutoMigrationService';
import { MigrationAlertService } from '../services/MigrationAlertService';

export interface Migration {
  name: string;
  path: string;
  checksum: string;
  content: string;
}

export interface AppliedMigration {
  id: number;
  migration_name: string;
  applied_at: Date;
  checksum: string;
}

export class MigrationManager {
  private pool: Pool;
  private migrationsDir: string;
  private autoMigrationService?: AutoMigrationService;
  private alertService?: MigrationAlertService;

  constructor(pool: Pool, migrationsDir?: string) {
    this.pool = pool;
    this.migrationsDir = migrationsDir || path.join(__dirname, '../../database/migrations');
  }

  /**
   * 设置自动迁移服务
   */
  public setAutoMigrationService(service: AutoMigrationService): void {
    this.autoMigrationService = service;
  }

  /**
   * 设置报警服务
   */
  public setAlertService(service: MigrationAlertService): void {
    this.alertService = service;
  }

  /**
   * 获取所有迁移文件
   */
  private async getMigrationFiles(): Promise<Migration[]> {
    if (!fs.existsSync(this.migrationsDir)) {
      console.log(`Migrations directory not found: ${this.migrationsDir}`);
      return [];
    }

    const files = fs.readdirSync(this.migrationsDir)
      .filter(file => file.endsWith('.sql'))
      .sort(); // 按文件名排序确保执行顺序

    const migrations: Migration[] = [];
    
    for (const file of files) {
      const filePath = path.join(this.migrationsDir, file);
      const content = fs.readFileSync(filePath, 'utf8');
      const checksum = crypto.createHash('sha256').update(content).digest('hex');
      
      migrations.push({
        name: file,
        path: filePath,
        content,
        checksum
      });
    }

    return migrations;
  }

  /**
   * 获取已应用的迁移记录
   */
  private async getAppliedMigrations(): Promise<AppliedMigration[]> {
    let connection: PoolConnection | null = null;
    try {
      connection = await this.pool.getConnection();
      
      // 首先检查迁移表是否存在
      const [tables] = await connection.execute(
        "SHOW TABLES LIKE 'database_migrations'"
      );
      
      if ((tables as any[]).length === 0) {
        console.log('Migrations table does not exist, will be created.');
        return [];
      }

      const [rows] = await connection.execute(
        'SELECT * FROM database_migrations ORDER BY applied_at'
      );
      
      return rows as AppliedMigration[];
    } catch (error) {
      console.error('Error getting applied migrations:', error);
      return [];
    } finally {
      if (connection) connection.release();
    }
  }

  /**
   * 执行单个迁移
   */
  private async executeMigration(migration: Migration): Promise<void> {
    let connection: PoolConnection | null = null;
    try {
      connection = await this.pool.getConnection();
      await connection.beginTransaction();

      console.log(`Executing migration: ${migration.name}`);
      
      // 改进的SQL语句分割和执行逻辑
      // 移除注释行，然后按分号分割
      const cleanContent = migration.content
        .split('\n')
        .filter(line => {
          const trimmed = line.trim();
          return trimmed.length > 0 && !trimmed.startsWith('--');
        })
        .join('\n');
      
      const statements = cleanContent
        .split(';')
        .map(stmt => stmt.trim())
        .filter(stmt => stmt.length > 0);

      console.log(`Found ${statements.length} SQL statements to execute`);
      
      for (let i = 0; i < statements.length; i++) {
        const statement = statements[i];
        if (statement.trim()) {
          console.log(`Executing statement ${i + 1}: ${statement.substring(0, 50)}...`);
          try {
            await connection.execute(statement);
            console.log(`Statement ${i + 1} executed successfully`);
          } catch (stmtError: any) {
            // 对于重复字段错误，记录警告但继续执行
            if (stmtError.code === 'ER_DUP_FIELDNAME' || stmtError.errno === 1060) {
              console.warn(`Warning: Column already exists in statement ${i + 1}, skipping...`);
              console.warn(`Statement content: ${statement}`);
              continue;
            }
            console.error(`Error executing statement ${i + 1}:`, stmtError);
            console.error(`Statement content: ${statement}`);
            throw stmtError;
          }
        }
      }

      // 记录迁移已应用
      await connection.execute(
        'INSERT INTO database_migrations (migration_name, checksum) VALUES (?, ?)',
        [migration.name, migration.checksum]
      );

      await connection.commit();
      console.log(`Migration ${migration.name} executed successfully`);
    } catch (error) {
      if (connection) {
        await connection.rollback();
      }
      console.error(`Error executing migration ${migration.name}:`, error);
      throw error;
    } finally {
      if (connection) connection.release();
    }
  }

  /**
   * 验证迁移完整性
   */
  private validateMigration(migration: Migration, applied: AppliedMigration): boolean {
    if (migration.checksum !== applied.checksum) {
      console.warn(`Migration ${migration.name} checksum mismatch!`);
      console.warn(`Expected: ${migration.checksum}`);
      console.warn(`Applied:  ${applied.checksum}`);
      return false;
    }
    return true;
  }

  /**
   * 运行所有待执行的迁移
   */
  public async runMigrations(): Promise<void> {
    try {
      console.log('Starting database migrations...');
      
      // 首先确保迁移表存在
      await this.ensureMigrationsTableExists();
      
      const allMigrations = await this.getMigrationFiles();
      const appliedMigrations = await this.getAppliedMigrations();
      
      console.log(`Found ${allMigrations.length} migration files`);
      console.log(`Found ${appliedMigrations.length} applied migrations`);

      // 创建已应用迁移的映射
      const appliedMap = new Map<string, AppliedMigration>();
      appliedMigrations.forEach(applied => {
        appliedMap.set(applied.migration_name, applied);
      });

      // 验证已应用的迁移
      for (const migration of allMigrations) {
        const applied = appliedMap.get(migration.name);
        if (applied && !this.validateMigration(migration, applied)) {
          throw new Error(`Migration integrity check failed for ${migration.name}`);
        }
      }

      // 执行未应用的迁移
      const pendingMigrations = allMigrations.filter(migration => 
        !appliedMap.has(migration.name)
      );

      if (pendingMigrations.length === 0) {
        console.log('No pending migrations to execute.');
        return;
      }

      console.log(`Executing ${pendingMigrations.length} pending migrations...`);
      
      for (const migration of pendingMigrations) {
        await this.executeMigration(migration);
      }

      console.log('All migrations completed successfully!');
      
      // 发送成功完成的通知
      await this.sendAlert({
        type: 'success',
        message: '所有数据库迁移已成功完成',
        timestamp: new Date(),
        details: { 
          totalMigrations: allMigrations.length,
          executedMigrations: pendingMigrations.length,
          phase: 'complete'
        }
      });
    } catch (error: any) {
      console.error('Migration failed:', error);
      
      // 发送失败通知
      await this.sendAlert({
        type: 'error',
        message: `数据库迁移失败: ${error.message}`,
        timestamp: new Date(),
        details: {
          error: error.message,
          stack: error.stack,
          phase: 'failed'
        }
      });
      
      throw error;
    }
  }

  /**
   * 发送报警通知
   */
  private async sendAlert(alert: MigrationAlert): Promise<void> {
    try {
      if (this.alertService) {
        await this.alertService.handleAlert(alert);
      }
    } catch (error: any) {
      console.error('Failed to send migration alert:', error);
      // 不因报警失败而中断迁移流程
    }
  }

  /**
   * 确保迁移表存在
   */
  private async ensureMigrationsTableExists(): Promise<void> {
    let connection: PoolConnection | null = null;
    try {
      connection = await this.pool.getConnection();
      
      const createTableSQL = `
        CREATE TABLE IF NOT EXISTS \`database_migrations\` (
          \`id\` int(11) NOT NULL AUTO_INCREMENT,
          \`migration_name\` varchar(255) NOT NULL,
          \`applied_at\` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
          \`checksum\` varchar(64) DEFAULT NULL,
          PRIMARY KEY (\`id\`),
          UNIQUE KEY \`migration_name\` (\`migration_name\`)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
      `;
      
      await connection.execute(createTableSQL);
      console.log('Migrations table ensured.');
    } catch (error) {
      console.error('Error ensuring migrations table:', error);
      throw error;
    } finally {
      if (connection) connection.release();
    }
  }

  /**
   * 获取迁移状态
   */
  public async getMigrationStatus(): Promise<{
    total: number;
    applied: number;
    pending: string[];
  }> {
    const allMigrations = await this.getMigrationFiles();
    const appliedMigrations = await this.getAppliedMigrations();
    
    const appliedNames = new Set(appliedMigrations.map(m => m.migration_name));
    const pendingMigrations = allMigrations
      .filter(m => !appliedNames.has(m.name))
      .map(m => m.name);

    return {
      total: allMigrations.length,
      applied: appliedMigrations.length,
      pending: pendingMigrations
    };
  }

  /**
   * 检测MySQL版本
   */
  private async getMySQLVersion(): Promise<string> {
    let connection: PoolConnection | null = null;
    try {
      connection = await this.pool.getConnection();
      const [rows] = await connection.execute('SELECT VERSION() as version');
      const version = (rows as any[])[0]?.version || '';
      return version;
    } catch (error) {
      console.error('Error getting MySQL version:', error);
      return '';
    } finally {
      if (connection) connection.release();
    }
  }

  /**
   * 检查是否需要MySQL 5.7兼容性迁移
   */
  private async needsMySQL57Compatibility(): Promise<boolean> {
    const version = await this.getMySQLVersion();
    console.log(`Detected MySQL version: ${version}`);
    
    // 检查是否是MySQL 5.7.x
    const isMySQL57 = version.startsWith('5.7.');
    
    if (isMySQL57) {
      // 检查是否已经应用了兼容性迁移
      const appliedMigrations = await this.getAppliedMigrations();
      const hasCompatibilityMigration = appliedMigrations.some(
        m => m.migration_name === '005_mysql57_compatibility.sql'
      );
      
      return !hasCompatibilityMigration;
    }
    
    return false;
  }

  /**
   * 运行所有待执行的迁移（增强版，支持MySQL 5.7兼容性检测）
   */
  public async runMigrationsWithCompatibilityCheck(): Promise<void> {
    try {
      console.log('Starting database migrations with compatibility check...');
      
      // 发送开始迁移的通知
      await this.sendAlert({
        type: 'success',
        message: '开始执行数据库迁移检查',
        timestamp: new Date(),
        details: { phase: 'start' }
      });
      
      // 首先确保迁移表存在
      await this.ensureMigrationsTableExists();
      
      // 检查MySQL 5.7兼容性需求
      const needsCompatibility = await this.needsMySQL57Compatibility();
      if (needsCompatibility) {
        console.log('MySQL 5.7 detected, compatibility migration will be prioritized.');
        await this.sendAlert({
          type: 'warning',
          message: '检测到MySQL 5.7，将优先执行兼容性迁移',
          timestamp: new Date(),
          details: { mysqlVersion: await this.getMySQLVersion() }
        });
      }
      
      const allMigrations = await this.getMigrationFiles();
      const appliedMigrations = await this.getAppliedMigrations();
      
      console.log(`Found ${allMigrations.length} migration files`);
      console.log(`Found ${appliedMigrations.length} applied migrations`);

      // 创建已应用迁移的映射
      const appliedMap = new Map<string, AppliedMigration>();
      appliedMigrations.forEach(applied => {
        appliedMap.set(applied.migration_name, applied);
      });

      // 验证已应用的迁移
      for (const migration of allMigrations) {
        const applied = appliedMap.get(migration.name);
        if (applied && !this.validateMigration(migration, applied)) {
          throw new Error(`Migration integrity check failed for ${migration.name}`);
        }
      }

      // 执行未应用的迁移
      let pendingMigrations = allMigrations.filter(migration => 
        !appliedMap.has(migration.name)
      );

      // 如果需要MySQL 5.7兼容性，优先执行兼容性迁移
      if (needsCompatibility) {
        const compatibilityMigration = pendingMigrations.find(
          m => m.name === '005_mysql57_compatibility.sql'
        );
        
        if (compatibilityMigration) {
          console.log('Prioritizing MySQL 5.7 compatibility migration...');
          // 先执行兼容性迁移
          await this.executeMigration(compatibilityMigration);
          // 从待执行列表中移除
          pendingMigrations = pendingMigrations.filter(
            m => m.name !== '005_mysql57_compatibility.sql'
          );
        }
      }

      if (pendingMigrations.length === 0) {
        console.log('No pending migrations to execute.');
        return;
      }

      console.log(`Executing ${pendingMigrations.length} pending migrations...`);
      
      for (const migration of pendingMigrations) {
        await this.executeMigration(migration);
      }

      console.log('All migrations completed successfully!');
    } catch (error) {
      console.error('Migration failed:', error);
      throw error;
    }
  }
}