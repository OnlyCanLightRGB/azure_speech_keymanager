import express from 'express';
import { KeyManager } from '../services/KeyManager';
import { AzureTTSService } from '../services/AzureTTSService';
import { AzureSTTService } from '../services/AzureSTTService';
import { ApiResponse, GetKeyRequest, SetKeyStatusRequest, AddKeyRequest, TestKeyRequest } from '../types';
import logger from '../utils/logger';

const router = express.Router();

export function createKeyRoutes(keyManager: KeyManager, ttsService: AzureTTSService, sttService: AzureSTTService) {
  
  /**
   * GET /api/keys/get - Get an available key
   */
  router.get('/get', async (req, res) => {
    try {
      const { region = 'eastasia', tag = '' } = req.query as GetKeyRequest;

      const key = await keyManager.getKey(region, tag);

      if (!key) {
        const response: ApiResponse = {
          success: false,
          message: `No available keys found for region: ${region}`
        };
        return res.status(404).json(response);
      }

      const response: ApiResponse = {
        success: true,
        data: key,
        message: 'Key retrieved successfully'
      };

      return res.json(response);
    } catch (error: any) {
      logger.error('Error in GET /api/keys/get:', error);
      const response: ApiResponse = {
        success: false,
        error: error.message
      };
      return res.status(500).json(response);
    }
  });

  /**
   * POST /api/keys/status - Set key status
   */
  router.post('/status', async (req, res) => {
    try {
      const { key, code, note = '' } = req.body as SetKeyStatusRequest;

      if (!key || !code) {
        const response: ApiResponse = {
          success: false,
          error: 'Key and code are required'
        };
        return res.status(400).json(response);
      }

      const result = await keyManager.setKeyStatus(key, code, note);

      const response: ApiResponse = {
        success: result.success,
        data: {
          action: result.action,
          statusChanged: result.statusChanged
        },
        message: result.message
      };

      return res.json(response);
    } catch (error: any) {
      logger.error('Error in POST /api/keys/status:', error);
      const response: ApiResponse = {
        success: false,
        error: error.message
      };
      return res.status(500).json(response);
    }
  });

  /**
   * POST /api/keys - Add a new key
   */
  router.post('/', async (req, res) => {
    try {
      const { key, region, keyname = '', priority_weight = 1 } = req.body as AddKeyRequest;

      if (!key || !region) {
        const response: ApiResponse = {
          success: false,
          error: 'Key and region are required'
        };
        return res.status(400).json(response);
      }

      const newKey = await keyManager.addKey(key, region, keyname, priority_weight);

      const response: ApiResponse = {
        success: true,
        data: newKey,
        message: 'Key added successfully'
      };

      return res.status(201).json(response);
    } catch (error: any) {
      logger.error('Error in POST /api/keys:', error);
      const response: ApiResponse = {
        success: false,
        error: error.message
      };
      return res.status(500).json(response);
    }
  });

  /**
   * DELETE /api/keys/:key - Delete a key
   */
  router.delete('/:key', async (req, res) => {
    try {
      const { key } = req.params;
      
      await keyManager.deleteKey(key);
      
      const response: ApiResponse = {
        success: true,
        message: 'Key deleted successfully'
      };
      
      res.json(response);
    } catch (error: any) {
      logger.error('Error in DELETE /api/keys/:key:', error);
      const response: ApiResponse = {
        success: false,
        error: error.message
      };
      res.status(500).json(response);
    }
  });

  /**
   * POST /api/keys/:key/disable - Disable a key
   */
  router.post('/:key/disable', async (req, res) => {
    try {
      const { key } = req.params;
      
      await keyManager.disableKey(key);
      
      const response: ApiResponse = {
        success: true,
        message: 'Key disabled successfully'
      };
      
      res.json(response);
    } catch (error: any) {
      logger.error('Error in POST /api/keys/:key/disable:', error);
      const response: ApiResponse = {
        success: false,
        error: error.message
      };
      res.status(500).json(response);
    }
  });

  /**
   * POST /api/keys/:key/enable - Enable a key
   */
  router.post('/:key/enable', async (req, res) => {
    try {
      const { key } = req.params;

      await keyManager.enableKey(key);

      const response: ApiResponse = {
        success: true,
        message: 'Key enabled successfully'
      };

      res.json(response);
    } catch (error: any) {
      logger.error('Error in POST /api/keys/:key/enable:', error);
      const response: ApiResponse = {
        success: false,
        error: error.message
      };
      res.status(500).json(response);
    }
  });

  /**
   * PUT /api/keys/:key - Update a key
   */
  router.put('/:key', async (req, res) => {
    try {
      const { key } = req.params;
      const { keyname, region } = req.body;

      if (!keyname || !region) {
        const response: ApiResponse = {
          success: false,
          error: 'Keyname and region are required'
        };
        return res.status(400).json(response);
      }

      const updatedKey = await keyManager.updateKey(key, keyname, region);

      const response: ApiResponse = {
        success: true,
        data: updatedKey,
        message: 'Key updated successfully'
      };

      return res.json(response);
    } catch (error: any) {
      logger.error('Error in PUT /api/keys/:key:', error);
      const response: ApiResponse = {
        success: false,
        error: error.message
      };
      return res.status(500).json(response);
    }
  });

  /**
   * POST /api/keys/test - Test a key
   */
  router.post('/test', async (req, res) => {
    try {
      const { key, region } = req.body as TestKeyRequest;

      if (!key || !region) {
        const response: ApiResponse = {
          success: false,
          error: 'Key and region are required'
        };
        return res.status(400).json(response);
      }

      const testResult = await ttsService.testKey(key, region);

      // Log the test result
      const statusResult = await keyManager.setKeyStatus(key, testResult.statusCode || 500, 'Key test performed');

      const response: ApiResponse = {
        success: testResult.success,
        data: {
          statusCode: testResult.statusCode,
          audioSize: testResult.audioData?.length || 0,
          error: testResult.error,
          statusUpdate: {
            action: statusResult.action,
            statusChanged: statusResult.statusChanged,
            message: statusResult.message
          }
        },
        message: testResult.success ? 'Key test successful' : 'Key test failed'
      };

      return res.status(testResult.success ? 200 : testResult.statusCode || 500).json(response);
    } catch (error: any) {
      logger.error('Error in POST /api/keys/test:', error);
      const response: ApiResponse = {
        success: false,
        error: error.message
      };
      return res.status(500).json(response);
    }
  });

  /**
   * POST /api/keys/test2 - Test a key using STT (Speech-to-Text)
   */
  router.post('/test2', async (req, res) => {
    try {
      const { key, region } = req.body as TestKeyRequest;

      if (!key || !region) {
        const response: ApiResponse = {
          success: false,
          error: 'Key and region are required'
        };
        return res.status(400).json(response);
      }

      const testResult = await sttService.testKey(key, region);

      // Log the test result
      const statusResult = await keyManager.setKeyStatus(key, testResult.statusCode || 500, 'STT key test performed');

      const response: ApiResponse = {
        success: testResult.success,
        data: {
          statusCode: testResult.statusCode,
          transcription: testResult.transcription || '',
          recognitionStatus: testResult.recognitionStatus || '',
          error: testResult.error,
          rawResponse: testResult.rawResponse,
          statusUpdate: {
            action: statusResult.action,
            statusChanged: statusResult.statusChanged,
            message: statusResult.message
          }
        },
        message: testResult.success ? 'STT key test successful' : 'STT key test failed'
      };

      return res.status(testResult.success ? 200 : testResult.statusCode || 500).json(response);
    } catch (error: any) {
      logger.error('Error in POST /api/keys/test2:', error);
      const response: ApiResponse = {
        success: false,
        error: error.message
      };
      return res.status(500).json(response);
    }
  });

  /**
   * GET /api/keys - Get all keys
   */
  router.get('/', async (req, res) => {
    try {
      const keys = await keyManager.getAllKeys();
      
      const response: ApiResponse = {
        success: true,
        data: keys,
        message: 'Keys retrieved successfully'
      };
      
      res.json(response);
    } catch (error: any) {
      logger.error('Error in GET /api/keys:', error);
      const response: ApiResponse = {
        success: false,
        error: error.message
      };
      res.status(500).json(response);
    }
  });

  /**
   * GET /api/keys/logs - Get key logs
   */
  router.get('/logs', async (req, res) => {
    try {
      const page = parseInt(req.query.page as string) || 1;
      const limit = parseInt(req.query.limit as string) || 50;
      
      const result = await keyManager.getKeyLogs(page, limit);
      
      const response: ApiResponse = {
        success: true,
        data: {
          logs: result.logs,
          total: result.total,
          page,
          limit,
          totalPages: Math.ceil(result.total / limit)
        },
        message: 'Logs retrieved successfully'
      };
      
      res.json(response);
    } catch (error: any) {
      logger.error('Error in GET /api/keys/logs:', error);
      const response: ApiResponse = {
        success: false,
        error: error.message
      };
      res.status(500).json(response);
    }
  });

  /**
   * PUT /api/keys/:key/enable - Enable a key
   */
  router.put('/:key/enable', async (req, res) => {
    try {
      const { key } = req.params;

      if (!key) {
        const response: ApiResponse = {
          success: false,
          error: 'Key is required'
        };
        return res.status(400).json(response);
      }

      await keyManager.enableKey(key);

      const response: ApiResponse = {
        success: true,
        message: 'Key enabled successfully'
      };

      return res.json(response);
    } catch (error: any) {
      logger.error('Error in PUT /api/keys/:key/enable:', error);
      const response: ApiResponse = {
        success: false,
        error: error.message
      };
      return res.status(500).json(response);
    }
  });

  /**
   * PUT /api/keys/:key/disable - Disable a key
   */
  router.put('/:key/disable', async (req, res) => {
    try {
      const { key } = req.params;

      if (!key) {
        const response: ApiResponse = {
          success: false,
          error: 'Key is required'
        };
        return res.status(400).json(response);
      }

      await keyManager.disableKey(key);

      const response: ApiResponse = {
        success: true,
        message: 'Key disabled successfully'
      };

      return res.json(response);
    } catch (error: any) {
      logger.error('Error in PUT /api/keys/:key/disable:', error);
      const response: ApiResponse = {
        success: false,
        error: error.message
      };
      return res.status(500).json(response);
    }
  });

  /**
   * POST /api/keys/sync - Sync cooldown states
   */
  router.post('/sync', async (req, res) => {
    try {
      await keyManager.syncCooldownStates();

      const response: ApiResponse = {
        success: true,
        message: 'Cooldown states synchronized successfully'
      };

      return res.json(response);
    } catch (error: any) {
      logger.error('Error in POST /api/keys/sync:', error);
      const response: ApiResponse = {
        success: false,
        error: error.message
      };
      return res.status(500).json(response);
    }
  });

  /**
   * POST /api/keys/:key/set-fallback - Set key as fallback key
   */
  router.post('/:key/set-fallback', async (req, res) => {
    try {
      const { key } = req.params;
      const { is_fallback = true } = req.body;

      await keyManager.setKeyPriorityWeight(key, is_fallback ? 0 : 1);

      const response: ApiResponse = {
        success: true,
        message: `Key ${is_fallback ? 'set as fallback' : 'set as normal'} successfully`
      };

      res.json(response);
    } catch (error: any) {
      logger.error('Error in POST /api/keys/:key/set-fallback:', error);
      const response: ApiResponse = {
        success: false,
        error: error.message
      };
      res.status(500).json(response);
    }
  });

  /**
   * GET /api/keys/stats - Get key statistics
   */
  router.get('/stats', async (req, res) => {
    try {
      const cooldownManager = keyManager.getCooldownManager();
      const cooldownStats = await cooldownManager.getStats();
      const cooldownKeys = await cooldownManager.getCooldownKeys();

      const response: ApiResponse = {
        success: true,
        data: {
          cooldown: cooldownStats,
          cooldownKeys: cooldownKeys
        },
        message: 'Statistics retrieved successfully'
      };

      res.json(response);
    } catch (error: any) {
      logger.error('Error in GET /api/keys/stats:', error);
      const response: ApiResponse = {
        success: false,
        error: error.message
      };
      res.status(500).json(response);
    }
  });

  return router;
}

export default router;
