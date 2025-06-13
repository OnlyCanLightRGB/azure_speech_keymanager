import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import dotenv from 'dotenv';
import path from 'path';

import DatabaseConnection from './database/connection';
import RedisConnection from './database/redis';
import { KeyManager } from './services/KeyManager';
import { AzureTTSService } from './services/AzureTTSService';
import { AzureSTTService } from './services/AzureSTTService';
import { createKeyRoutes } from './routes/keys';
import { createConfigRoutes } from './routes/config';
import logger from './utils/logger';
import { DatabaseConfig, ApiResponse } from './types';

// Load environment variables
dotenv.config({ path: path.join(__dirname, '../.env') });

class Server {
  private app: express.Application;
  private database: DatabaseConnection;
  private redis: RedisConnection;
  private keyManager: KeyManager | null = null;
  private ttsService: AzureTTSService;
  private sttService: AzureSTTService;
  private port: number;

  constructor() {
    this.app = express();
    this.port = parseInt(process.env.PORT || '3001');
    this.ttsService = new AzureTTSService();
    this.sttService = new AzureSTTService();

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
        ? [`http://localhost:${process.env.FRONTEND_PORT || '3000'}`] // Add your production domains
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

    // API routes
    this.app.use('/api/keys', createKeyRoutes(this.keyManager, this.ttsService, this.sttService));
    this.app.use('/api/config', createConfigRoutes(this.database.getPool()));

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
            keyManager: this.keyManager ? 'running' : 'stopped'
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
        title: 'Azure Speech Key Manager API',
        version: '1.0.0',
        endpoints: {
          keys: {
            'GET /api/keys/get': 'Get an available key',
            'POST /api/keys/status': 'Set key status',
            'POST /api/keys': 'Add a new key',
            'DELETE /api/keys/:key': 'Delete a key',
            'POST /api/keys/:key/disable': 'Disable a key',
            'POST /api/keys/:key/enable': 'Enable a key',
            'POST /api/keys/test': 'Test a key using TTS',
            'POST /api/keys/test2': 'Test a key using STT',
            'GET /api/keys': 'Get all keys',
            'GET /api/keys/logs': 'Get key logs',
            'GET /api/keys/stats': 'Get key statistics'
          },
          config: {
            'GET /api/config': 'Get all configuration',
            'GET /api/config/:key': 'Get specific configuration',
            'POST /api/config': 'Create or update configuration',
            'PUT /api/config/:key': 'Update specific configuration',
            'DELETE /api/config/:key': 'Delete configuration',
            'POST /api/config/batch': 'Batch update configurations'
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
      await this.database.initialize();
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

  public async start(): Promise<void> {
    try {
      // Initialize database
      await this.initializeDatabase();

      // Initialize Redis
      await this.initializeRedis();

      // Initialize key manager
      await this.initializeKeyManager();

      // Setup middleware and routes
      this.setupMiddleware();
      this.setupRoutes();

      // Start server
      this.app.listen(this.port, () => {
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
