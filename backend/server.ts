import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import dotenv from 'dotenv';
import path from 'path';

import DatabaseConnection from './database/connection';
import RedisConnection from './database/redis';
import { KeyManager } from './services/KeyManager';
import { TranslationKeyManager } from './services/TranslationKeyManager';
import { AzureTTSService } from './services/AzureTTSService';
import { AzureSTTService } from './services/AzureSTTService';
import { AzureTranslationService } from './services/AzureTranslationService';
import { AzureSpeechTranslationService } from './services/AzureSpeechTranslationService';
import { AzureCLIService } from './services/AzureCLIService';
import { EnhancedConfigService } from './services/EnhancedConfigService';
import { BillingService } from './services/BillingService';
import { SchedulerService } from './services/SchedulerService';
import { AutoMigrationService } from './services/AutoMigrationService';
import { MigrationAlertService } from './services/MigrationAlertService';
import { createKeyRoutes } from './routes/keys';
import { createTranslationRoutes } from './routes/translation';
import { createUploadRoutes } from './routes/upload';
import { createConfigRoutes } from './routes/config';
import { createAzureCLIRoutes } from './routes/azure-cli';
import { createBillingRoutes } from './routes/billing';
import scriptsRouter from './routes/scripts';
import logger from './utils/logger';
import { DatabaseConfig, ApiResponse } from './types';

// Load environment variables
dotenv.config({ path: path.join(__dirname, '../.env') });

class Server {
  private app: express.Application;
  private database: DatabaseConnection;
  private redis: RedisConnection;
  private keyManager: KeyManager | null = null;
  private translationKeyManager: TranslationKeyManager | null = null;
  private ttsService: AzureTTSService;
  private sttService: AzureSTTService;
  private translationService: AzureTranslationService;
  private speechTranslationService: AzureSpeechTranslationService;
  private azureCLIService: AzureCLIService;
  private enhancedConfigService: EnhancedConfigService;
  private billingService: BillingService;
  private schedulerService: SchedulerService;
  private autoMigrationService: AutoMigrationService | null = null;
  private migrationAlertService: MigrationAlertService | null = null;
  private port: number;

  constructor() {
    this.app = express();
    this.port = parseInt(process.env.PORT || '3001');
    this.ttsService = new AzureTTSService();
    this.sttService = new AzureSTTService();
    this.translationService = new AzureTranslationService();
    this.speechTranslationService = new AzureSpeechTranslationService();
    
    // 初始化Azure CLI和增强配置服务
    this.enhancedConfigService = new EnhancedConfigService();
    this.azureCLIService = new AzureCLIService({
      appId: process.env.AZURE_APP_ID || '',
      password: process.env.AZURE_PASSWORD || '',
      tenant: process.env.AZURE_TENANT || '',
      displayName: process.env.AZURE_DISPLAY_NAME || ''
    });

    // 初始化计费服务
    this.billingService = new BillingService(this.azureCLIService);
    this.schedulerService = new SchedulerService(this.billingService);

    // Database configuration
    const dbConfig: DatabaseConfig = {
      host: process.env.DB_HOST || 'localhost',
      port: parseInt(process.env.DB_PORT || '3306'),
      user: process.env.DB_USER || 'root',
      password: process.env.DB_PASSWORD || '',
      database: process.env.DB_NAME || 'azure_speech_keymanager'
    };

    this.database = new DatabaseConnection(dbConfig);
    this.redis = RedisConnection.getInstance();
  }

  private setupMiddleware(): void {
    // Security middleware
    this.app.use(helmet({
      contentSecurityPolicy: false, // Disable for development
      crossOriginEmbedderPolicy: false
    }));

    // CORS configuration
    this.app.use(cors({
      origin: process.env.NODE_ENV === 'production'
        ? (origin, callback) => {
            // Allow requests with no origin (like mobile apps or curl requests)
            if (!origin) return callback(null, true);

            // Allow localhost and 127.0.0.1 with any port
            if (origin.match(/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/)) {
              return callback(null, true);
            }

            // Allow any origin for external access (you can restrict this in production)
            // For security, you should replace this with your actual domain(s)
            return callback(null, true);
          }
        : true,
      credentials: true
    }));

    // Body parsing middleware
    this.app.use(express.json({ limit: '10mb' }));
    this.app.use(express.urlencoded({ extended: true, limit: '10mb' }));

    // Request logging middleware
    this.app.use((req, res, next) => {
      logger.info(`${req.method} ${req.path}`, {
        ip: req.ip,
        userAgent: req.get('User-Agent'),
        query: req.query,
        body: req.method === 'POST' || req.method === 'PUT' ? req.body : undefined
      });
      next();
    });
  }

  private setupRoutes(): void {
    if (!this.keyManager) {
      throw new Error('KeyManager not initialized');
    }

    if (!this.translationKeyManager) {
      throw new Error('TranslationKeyManager not initialized');
    }

    // API routes
    this.app.use('/api/keys', createKeyRoutes(this.keyManager, this.ttsService, this.sttService));
    this.app.use('/api/translation', createTranslationRoutes(this.translationKeyManager, this.translationService, this.speechTranslationService));
    this.app.use('/api/upload', createUploadRoutes(this.keyManager, this.translationKeyManager, this.billingService, this.schedulerService));
    this.app.use('/api/config', createConfigRoutes(this.database.getPool()));
    this.app.use('/api/azure-cli', createAzureCLIRoutes(this.azureCLIService, this.enhancedConfigService));
    this.app.use('/api/billing', createBillingRoutes(this.billingService, this.schedulerService));
    this.app.use('/api/scripts', scriptsRouter);

    // Health check endpoint
    this.app.get('/api/health', async (req, res) => {
      try {
        // Test database connection
        const connection = await this.database.getPool().getConnection();
        await connection.ping();
        connection.release();

        // Test Redis connection
        const redisHealthy = await this.redis.ping();

        const response: ApiResponse = {
          success: true,
          data: {
            status: 'healthy',
            timestamp: new Date().toISOString(),
            version: '1.0.0',
            database: 'connected',
            redis: redisHealthy ? 'connected' : 'disconnected',
            keyManager: this.keyManager ? 'running' : 'stopped',
            translationKeyManager: this.translationKeyManager ? 'running' : 'stopped'
          },
          message: 'Service is healthy'
        };

        res.json(response);
      } catch (error: any) {
        logger.error('Health check failed:', error);
        const response: ApiResponse = {
          success: false,
          error: error.message,
          data: {
            status: 'unhealthy',
            timestamp: new Date().toISOString()
          }
        };
        res.status(503).json(response);
      }
    });

    // API documentation endpoint
    this.app.get('/api/docs', (req, res) => {
      const docs = {
        title: 'Azure Speech & Translation Key Manager API',
        version: '1.0.0',
        endpoints: {
          keys: {
            'GET /api/keys/get': 'Get an available speech key',
            'POST /api/keys/status': 'Set speech key status',
            'POST /api/keys': 'Add a new speech key',
            'DELETE /api/keys/:key': 'Delete a speech key',
            'POST /api/keys/:key/disable': 'Disable a speech key',
            'POST /api/keys/:key/enable': 'Enable a speech key',
            'POST /api/keys/test': 'Test a speech key using TTS',
            'POST /api/keys/test2': 'Test a speech key using STT',
            'GET /api/keys': 'Get all speech keys',
            'GET /api/keys/logs': 'Get speech key logs',
            'GET /api/keys/stats': 'Get speech key statistics'
          },
          translation: {
            'GET /api/translation/keys/get': 'Get an available translation key',
            'POST /api/translation/keys/status': 'Set translation key status',
            'POST /api/translation/keys': 'Add a new translation key',
            'DELETE /api/translation/keys/:key': 'Delete a translation key',
            'POST /api/translation/keys/:key/disable': 'Disable a translation key',
            'POST /api/translation/keys/:key/enable': 'Enable a translation key',
            'POST /api/translation/keys/test': 'Test a translation key (text)',
            'POST /api/translation/keys/test-speech': 'Test a translation key (speech)',
            'GET /api/translation/keys': 'Get all translation keys',
            'GET /api/translation/keys/logs': 'Get translation key logs',
            'GET /api/translation/keys/stats': 'Get translation key statistics',
            'POST /api/translation/translate': 'Translate text',
            'POST /api/translation/translate-speech': 'Translate speech'
          },
          upload: {
            'POST /api/upload/keys': 'Upload JSON file to batch create keys',
            'POST /api/upload/bulk-operation': 'Bulk operation on keys (enable/disable/delete)',
            'GET /api/upload/template': 'Get JSON template for key upload',
            'POST /api/upload/validate': 'Validate JSON file format'
          },
          config: {
            'GET /api/config': 'Get all configuration',
            'GET /api/config/:key': 'Get specific configuration',
            'POST /api/config': 'Create or update configuration',
            'PUT /api/config/:key': 'Update specific configuration',
            'DELETE /api/config/:key': 'Delete configuration',
            'POST /api/config/batch': 'Batch update configurations'
          },
          'azure-cli': {
            'GET /api/azure-cli/health': 'Check Azure CLI connection status',
            'GET /api/azure-cli/subscriptions': 'Get Azure subscriptions',
            'GET /api/azure-cli/cognitive-services': 'Get cognitive services',
            'POST /api/azure-cli/auto-discover': 'Perform auto-discovery',
            'GET /api/azure-cli/quota/:subscriptionId/:resourceId': 'Get quota usage',
            'GET /api/azure-cli/service-health/:subscriptionId/:resourceId': 'Check service health',
            'GET /api/azure-cli/endpoints': 'Get endpoint configuration',
            'PUT /api/azure-cli/endpoints/:type/:name': 'Update endpoint configuration',
            'POST /api/azure-cli/endpoints/:type': 'Add new endpoint'
          },
          billing: {
            'GET /api/billing/stats/:subscriptionId': 'Get real-time billing statistics',
            'GET /api/billing/cognitive-services/:subscriptionId': 'Get cognitive services billing details',
            'GET /api/billing/anomalies/:subscriptionId': 'Check billing anomalies',
            'GET /api/billing/report/:subscriptionId': 'Generate billing report (JSON/CSV)',
            'POST /api/billing/monitoring/start': 'Start billing monitoring (10min interval)',
            'POST /api/billing/monitoring/stop/:taskId': 'Stop billing monitoring',
            'GET /api/billing/monitoring/status': 'Get monitoring task status',
            'POST /api/billing/monitoring/execute/:taskId': 'Execute monitoring task manually',
            'GET /api/billing/usage/:subscriptionId': 'Get billing usage details',
            'GET /api/billing/overview/:subscriptionId': 'Get billing overview'
          },
          system: {
            'GET /api/health': 'Health check',
            'GET /api/docs': 'API documentation'
          }
        }
      };

      res.json(docs);
    });

    // Serve static files in production
    if (process.env.NODE_ENV === 'production') {
      this.app.use(express.static(path.join(__dirname, '../frontend/out')));
      
      // Catch all handler for SPA
      this.app.get('*', (req, res) => {
        res.sendFile(path.join(__dirname, '../frontend/out/index.html'));
      });
    }

    // 404 handler for API routes
    this.app.use('/api/*', (req, res) => {
      const response: ApiResponse = {
        success: false,
        error: 'API endpoint not found'
      };
      res.status(404).json(response);
    });

    // Global error handler
    this.app.use((error: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
      logger.error('Unhandled error:', error);
      
      const response: ApiResponse = {
        success: false,
        error: process.env.NODE_ENV === 'production' 
          ? 'Internal server error' 
          : error.message
      };
      
      res.status(500).json(response);
    });
  }

  private async initializeDatabase(): Promise<void> {
    try {
      // 首先初始化数据库连接
      await this.database.initialize();
      
      // 初始化报警服务
      this.migrationAlertService = new MigrationAlertService({
        console: { enabled: true, colors: true },
        logFile: { 
          enabled: true, 
          path: path.join(__dirname, '../logs/migration-alerts.log') 
        },
        webhook: {
          enabled: process.env.MIGRATION_WEBHOOK_URL ? true : false,
          url: process.env.MIGRATION_WEBHOOK_URL || '',
          headers: {
            'Authorization': process.env.MIGRATION_WEBHOOK_TOKEN || ''
          }
        }
      });

      // 初始化自动迁移服务（数据库连接已建立后）
      this.autoMigrationService = new AutoMigrationService(
        this.database.getPool()
      );
      
      // 执行自动迁移检查
      logger.info('Starting automatic migration check...');
      await this.autoMigrationService.executeAutoMigration();
      
      logger.info('Database initialized successfully');
    } catch (error) {
      logger.error('Failed to initialize database:', error);
      throw error;
    }
  }

  private async initializeRedis(): Promise<void> {
    try {
      await this.redis.connect();
      logger.info('Redis initialized successfully');
    } catch (error) {
      logger.error('Failed to initialize Redis:', error);
      throw error;
    }
  }

  private async initializeKeyManager(): Promise<void> {
    try {
      this.keyManager = new KeyManager(this.database.getPool());
      logger.info('KeyManager initialized successfully');

      // Sync cooldown states between database and Redis
      await this.keyManager.syncCooldownStates();
    } catch (error) {
      logger.error('Failed to initialize KeyManager:', error);
      throw error;
    }
  }

  private async initializeTranslationKeyManager(): Promise<void> {
    try {
      this.translationKeyManager = new TranslationKeyManager(this.database.getPool());
      logger.info('TranslationKeyManager initialized successfully');

      // Sync cooldown states between database and Redis
      await this.translationKeyManager.syncCooldownStates();
    } catch (error) {
      logger.error('Failed to initialize TranslationKeyManager:', error);
      throw error;
    }
  }

  private async startBillingMonitoring(): Promise<void> {
    try {
      // Start the billing monitoring scheduler
      const subscriptionId = process.env.AZURE_SUBSCRIPTION_ID || '';
      if (subscriptionId) {
        const taskId = this.schedulerService.startBillingMonitoring(subscriptionId);
        logger.info(`Billing monitoring started successfully with task ID: ${taskId}`);
      } else {
        logger.warn('AZURE_SUBSCRIPTION_ID not configured, skipping billing monitoring');
      }
    } catch (error) {
      logger.error('Failed to start billing monitoring:', error);
      // Don't throw error to prevent server startup failure
      logger.warn('Server will continue without billing monitoring');
    }
  }

  public async start(): Promise<void> {
    try {
      // Initialize database
      await this.initializeDatabase();

      // Initialize Redis
      await this.initializeRedis();

      // Initialize key managers
      await this.initializeKeyManager();
      await this.initializeTranslationKeyManager();

      // Setup middleware and routes
      this.setupMiddleware();
      this.setupRoutes();

      // Start billing monitoring
      await this.startBillingMonitoring();

      // Start server
      this.app.listen(this.port, '0.0.0.0', () => {
        logger.info(`Server started on port ${this.port}`);
        logger.info(`Environment: ${process.env.NODE_ENV || 'development'}`);
        logger.info(`Health check: http://localhost:${this.port}/api/health`);
        logger.info(`API docs: http://localhost:${this.port}/api/docs`);
      });

    } catch (error) {
      logger.error('Failed to start server:', error);
      process.exit(1);
    }
  }

  public async stop(): Promise<void> {
    try {
      if (this.keyManager) {
        await this.keyManager.cleanup();
      }

      if (this.translationKeyManager) {
        await this.translationKeyManager.cleanup();
      }

      await this.redis.disconnect();
      await this.database.close();
      logger.info('Server stopped gracefully');
    } catch (error) {
      logger.error('Error stopping server:', error);
    }
  }
}

// Handle graceful shutdown
const server = new Server();

process.on('SIGTERM', async () => {
  logger.info('SIGTERM received, shutting down gracefully');
  await server.stop();
  process.exit(0);
});

process.on('SIGINT', async () => {
  logger.info('SIGINT received, shutting down gracefully');
  await server.stop();
  process.exit(0);
});

// Start server
server.start().catch((error) => {
  logger.error('Failed to start server:', error);
  process.exit(1);
});

export default Server;
