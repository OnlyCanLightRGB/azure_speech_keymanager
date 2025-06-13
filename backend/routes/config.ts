import express from 'express';
import mysql from 'mysql2/promise';
import { ApiResponse, SystemConfig } from '../types';
import logger from '../utils/logger';

const router = express.Router();

export function createConfigRoutes(db: mysql.Pool) {
  
  /**
   * GET /api/config - Get all configuration
   */
  router.get('/', async (req, res) => {
    try {
      const [rows] = await db.execute<mysql.RowDataPacket[]>(
        'SELECT * FROM system_config ORDER BY config_key'
      );
      
      const response: ApiResponse = {
        success: true,
        data: rows,
        message: 'Configuration retrieved successfully'
      };
      
      res.json(response);
    } catch (error: any) {
      logger.error('Error in GET /api/config:', error);
      const response: ApiResponse = {
        success: false,
        error: error.message
      };
      res.status(500).json(response);
    }
  });

  /**
   * GET /api/config/:key - Get specific configuration
   */
  router.get('/:key', async (req, res) => {
    try {
      const { key } = req.params;

      const [rows] = await db.execute<mysql.RowDataPacket[]>(
        'SELECT * FROM system_config WHERE config_key = ?',
        [key]
      );

      if (rows.length === 0) {
        const response: ApiResponse = {
          success: false,
          message: `Configuration key '${key}' not found`
        };
        return res.status(404).json(response);
      }

      const response: ApiResponse = {
        success: true,
        data: rows[0],
        message: 'Configuration retrieved successfully'
      };

      return res.json(response);
    } catch (error: any) {
      logger.error('Error in GET /api/config/:key:', error);
      const response: ApiResponse = {
        success: false,
        error: error.message
      };
      return res.status(500).json(response);
    }
  });

  /**
   * POST /api/config - Create or update configuration
   */
  router.post('/', async (req, res) => {
    try {
      const { config_key, config_value, description } = req.body as SystemConfig;

      if (!config_key || config_value === undefined) {
        const response: ApiResponse = {
          success: false,
          error: 'config_key and config_value are required'
        };
        return res.status(400).json(response);
      }

      // Use INSERT ... ON DUPLICATE KEY UPDATE for upsert
      await db.execute(
        `INSERT INTO system_config (config_key, config_value, description)
         VALUES (?, ?, ?)
         ON DUPLICATE KEY UPDATE
         config_value = VALUES(config_value),
         description = VALUES(description)`,
        [config_key, config_value, description || '']
      );

      const response: ApiResponse = {
        success: true,
        message: 'Configuration saved successfully'
      };

      return res.json(response);
    } catch (error: any) {
      logger.error('Error in POST /api/config:', error);
      const response: ApiResponse = {
        success: false,
        error: error.message
      };
      return res.status(500).json(response);
    }
  });

  /**
   * PUT /api/config/:key - Update specific configuration
   */
  router.put('/:key', async (req, res) => {
    try {
      const { key } = req.params;
      const { config_value, description } = req.body;

      if (config_value === undefined) {
        const response: ApiResponse = {
          success: false,
          error: 'config_value is required'
        };
        return res.status(400).json(response);
      }

      const [result] = await db.execute<mysql.ResultSetHeader>(
        'UPDATE system_config SET config_value = ?, description = ? WHERE config_key = ?',
        [config_value, description || '', key]
      );

      if (result.affectedRows === 0) {
        const response: ApiResponse = {
          success: false,
          message: `Configuration key '${key}' not found`
        };
        return res.status(404).json(response);
      }

      const response: ApiResponse = {
        success: true,
        message: 'Configuration updated successfully'
      };

      return res.json(response);
    } catch (error: any) {
      logger.error('Error in PUT /api/config/:key:', error);
      const response: ApiResponse = {
        success: false,
        error: error.message
      };
      return res.status(500).json(response);
    }
  });

  /**
   * DELETE /api/config/:key - Delete configuration
   */
  router.delete('/:key', async (req, res) => {
    try {
      const { key } = req.params;

      const [result] = await db.execute<mysql.ResultSetHeader>(
        'DELETE FROM system_config WHERE config_key = ?',
        [key]
      );

      if (result.affectedRows === 0) {
        const response: ApiResponse = {
          success: false,
          message: `Configuration key '${key}' not found`
        };
        return res.status(404).json(response);
      }

      const response: ApiResponse = {
        success: true,
        message: 'Configuration deleted successfully'
      };

      return res.json(response);
    } catch (error: any) {
      logger.error('Error in DELETE /api/config/:key:', error);
      const response: ApiResponse = {
        success: false,
        error: error.message
      };
      return res.status(500).json(response);
    }
  });

  /**
   * POST /api/config/batch - Batch update configurations
   */
  router.post('/batch', async (req, res) => {
    const connection = await db.getConnection();

    try {
      const { configs } = req.body as { configs: SystemConfig[] };

      if (!Array.isArray(configs)) {
        const response: ApiResponse = {
          success: false,
          error: 'configs must be an array'
        };
        return res.status(400).json(response);
      }

      await connection.beginTransaction();

      for (const config of configs) {
        if (!config.config_key || config.config_value === undefined) {
          throw new Error('Each config must have config_key and config_value');
        }

        await connection.execute(
          `INSERT INTO system_config (config_key, config_value, description)
           VALUES (?, ?, ?)
           ON DUPLICATE KEY UPDATE
           config_value = VALUES(config_value),
           description = VALUES(description)`,
          [config.config_key, config.config_value, config.description || '']
        );
      }

      await connection.commit();

      const response: ApiResponse = {
        success: true,
        message: `${configs.length} configurations updated successfully`
      };

      return res.json(response);
    } catch (error: any) {
      await connection.rollback();
      logger.error('Error in POST /api/config/batch:', error);
      const response: ApiResponse = {
        success: false,
        error: error.message
      };
      return res.status(500).json(response);
    } finally {
      connection.release();
    }
  });

  return router;
}

export default router;
