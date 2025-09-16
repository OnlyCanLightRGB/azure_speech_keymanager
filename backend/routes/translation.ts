import express from 'express';
import { TranslationKeyManager } from '../services/TranslationKeyManager';
import { AzureTranslationService } from '../services/AzureTranslationService';
import { AzureSpeechTranslationService } from '../services/AzureSpeechTranslationService';
import { 
  ApiResponse, 
  TranslationRequest, 
  TranslationTestRequest,
  SpeechTranslationRequest,
  SpeechTranslationTestRequest
} from '../types';
import logger from '../utils/logger';

const router = express.Router();

export function createTranslationRoutes(
  translationKeyManager: TranslationKeyManager,
  translationService: AzureTranslationService,
  speechTranslationService: AzureSpeechTranslationService
) {
  
  /**
   * GET /api/translation/keys/get - Get an available translation key
   */
  router.get('/keys/get', async (req, res) => {
    try {
      const { region = 'global', tag = '', maxConcurrentRequests = '10' } = req.query as any;
      const maxConcurrent = parseInt(maxConcurrentRequests) || 10;

      const key = await translationKeyManager.getKey(region, tag);

      if (!key) {
        const response: ApiResponse = {
          success: false,
          message: `No available translation keys found for region: ${region}`
        };
        return res.status(404).json(response);
      }

      const response: ApiResponse = {
        success: true,
        data: key,
        message: 'Translation key retrieved successfully'
      };

      return res.json(response);
    } catch (error: any) {
      logger.error('Error in GET /api/translation/keys/get:', error);
      
      // Handle 429 concurrent limit error
      if (error.statusCode === 429 && error.keyReachedLimit) {
        const response: ApiResponse = {
          success: false,
          error: 'Too Many Requests - Translation service concurrent limit reached',
          message: 'The translation service is currently handling too many concurrent requests. Please try again later.'
        };
        return res.status(429).json(response);
      }
      
      const response: ApiResponse = {
        success: false,
        error: error.message
      };
      return res.status(500).json(response);
    }
  });

  /**
   * POST /api/translation/keys/status - Set translation key status
   */
  router.post('/keys/status', async (req, res) => {
    try {
      const { key, code, note = '' } = req.body;

      if (!key || !code) {
        const response: ApiResponse = {
          success: false,
          error: 'Key and code are required'
        };
        return res.status(400).json(response);
      }

      const result = await translationKeyManager.setKeyStatus(key, code, note);

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
      logger.error('Error in POST /api/translation/keys/status:', error);
      const response: ApiResponse = {
        success: false,
        error: error.message
      };
      return res.status(500).json(response);
    }
  });

  /**
   * POST /api/translation/keys - Add a new translation key
   */
  router.post('/keys', async (req, res) => {
    try {
      const { key, region, keyname = '' } = req.body;

      if (!key || !region) {
        const response: ApiResponse = {
          success: false,
          error: 'Key and region are required'
        };
        return res.status(400).json(response);
      }

      const newKey = await translationKeyManager.addKey(key, region, keyname);

      const response: ApiResponse = {
        success: true,
        data: newKey,
        message: 'Translation key added successfully'
      };

      return res.status(201).json(response);
    } catch (error: any) {
      logger.error('Error in POST /api/translation/keys:', error);
      const response: ApiResponse = {
        success: false,
        error: error.message
      };
      return res.status(500).json(response);
    }
  });

  /**
   * DELETE /api/translation/keys/:key - Delete a translation key
   */
  router.delete('/keys/:key', async (req, res) => {
    try {
      const { key } = req.params;
      
      await translationKeyManager.deleteKey(key);
      
      const response: ApiResponse = {
        success: true,
        message: 'Translation key deleted successfully'
      };
      
      res.json(response);
    } catch (error: any) {
      logger.error('Error in DELETE /api/translation/keys/:key:', error);
      const response: ApiResponse = {
        success: false,
        error: error.message
      };
      res.status(500).json(response);
    }
  });

  /**
   * POST /api/translation/keys/:key/disable - Disable a translation key
   */
  router.post('/keys/:key/disable', async (req, res) => {
    try {
      const { key } = req.params;
      
      await translationKeyManager.disableKey(key);
      
      const response: ApiResponse = {
        success: true,
        message: 'Translation key disabled successfully'
      };
      
      res.json(response);
    } catch (error: any) {
      logger.error('Error in POST /api/translation/keys/:key/disable:', error);
      const response: ApiResponse = {
        success: false,
        error: error.message
      };
      res.status(500).json(response);
    }
  });

  /**
   * POST /api/translation/keys/:key/enable - Enable a translation key
   */
  router.post('/keys/:key/enable', async (req, res) => {
    try {
      const { key } = req.params;

      await translationKeyManager.enableKey(key);

      const response: ApiResponse = {
        success: true,
        message: 'Translation key enabled successfully'
      };

      res.json(response);
    } catch (error: any) {
      logger.error('Error in POST /api/translation/keys/:key/enable:', error);
      const response: ApiResponse = {
        success: false,
        error: error.message
      };
      res.status(500).json(response);
    }
  });

  /**
   * PUT /api/translation/keys/:key - Update a translation key
   */
  router.put('/keys/:key', async (req, res) => {
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

      const updatedKey = await translationKeyManager.updateKey(key, keyname, region);

      const response: ApiResponse = {
        success: true,
        data: updatedKey,
        message: 'Translation key updated successfully'
      };

      return res.json(response);
    } catch (error: any) {
      logger.error('Error in PUT /api/translation/keys/:key:', error);
      const response: ApiResponse = {
        success: false,
        error: error.message
      };
      return res.status(500).json(response);
    }
  });

  /**
   * POST /api/translation/keys/test - Test a translation key (text translation)
   */
  router.post('/keys/test', async (req, res) => {
    try {
      const { key, region, text = 'Hello world', from = 'en', to = 'zh-Hans' } = req.body as TranslationTestRequest;

      if (!key || !region) {
        const response: ApiResponse = {
          success: false,
          error: 'Key and region are required'
        };
        return res.status(400).json(response);
      }

      const testResult = await translationService.testKey(key, region, text, from, to);

      // Log the test result
      const statusResult = await translationKeyManager.setKeyStatus(key, testResult.statusCode || 500, 'Translation key test performed');

      const response: ApiResponse = {
        success: testResult.success,
        data: {
          statusCode: testResult.statusCode,
          translatedText: testResult.translatedText,
          detectedLanguage: testResult.detectedLanguage,
          error: testResult.error,
          statusUpdate: {
            action: statusResult.action,
            statusChanged: statusResult.statusChanged,
            message: statusResult.message
          }
        },
        message: testResult.success ? 'Translation key test successful' : 'Translation key test failed'
      };

      return res.status(testResult.success ? 200 : testResult.statusCode || 500).json(response);
    } catch (error: any) {
      logger.error('Error in POST /api/translation/keys/test:', error);
      const response: ApiResponse = {
        success: false,
        error: error.message
      };
      return res.status(500).json(response);
    }
  });

  /**
   * POST /api/translation/keys/test-speech - Test a translation key (speech translation)
   */
  router.post('/keys/test-speech', async (req, res) => {
    try {
      const { key, region, audioData, from = 'en-US', to = 'zh-CN', voice } = req.body as SpeechTranslationTestRequest;

      if (!key || !region || !audioData) {
        const response: ApiResponse = {
          success: false,
          error: 'Key, region, and audioData are required'
        };
        return res.status(400).json(response);
      }

      // Convert base64 audio data to Buffer
      const audioBuffer = Buffer.from(audioData as unknown as string, 'base64');

      const testResult = await speechTranslationService.testKeyWithParams(key, region, {
        audioData: audioBuffer,
        from,
        to,
        voice
      });

      // Log the test result
      const statusResult = await translationKeyManager.setKeyStatus(key, testResult.statusCode || 500, 'Speech translation key test performed');

      const response: ApiResponse = {
        success: testResult.success,
        data: {
          statusCode: testResult.statusCode,
          translatedText: testResult.translatedText,
          detectedLanguage: testResult.detectedLanguage,
          error: testResult.error,
          statusUpdate: {
            action: statusResult.action,
            statusChanged: statusResult.statusChanged,
            message: statusResult.message
          }
        },
        message: testResult.success ? 'Speech translation key test successful' : 'Speech translation key test failed'
      };

      return res.status(testResult.success ? 200 : testResult.statusCode || 500).json(response);
    } catch (error: any) {
      logger.error('Error in POST /api/translation/keys/test-speech:', error);
      const response: ApiResponse = {
        success: false,
        error: error.message
      };
      return res.status(500).json(response);
    }
  });

  /**
   * POST /api/translation/translate - Translate text
   */
  router.post('/translate', async (req, res) => {
    try {
      const { text, from, to, apiVersion } = req.body as TranslationRequest;

      if (!text || !to) {
        const response: ApiResponse = {
          success: false,
          error: 'Text and target language (to) are required'
        };
        return res.status(400).json(response);
      }

      // Get a translation key - try eastasia first, then global
      let key = await translationKeyManager.getKey('eastasia');
      if (!key) {
        key = await translationKeyManager.getKey('global');
      }
      if (!key) {
        const response: ApiResponse = {
          success: false,
          error: 'No available translation keys'
        };
        return res.status(503).json(response);
      }

      const translationRequest: TranslationRequest = {
        text,
        from,
        to,
        apiVersion
      };

      const result = await translationService.translate(key.key, key.region, translationRequest);

      // Log the result
      await translationKeyManager.setKeyStatus(key.key, result.statusCode || 500, 'Text translation performed');

      const response: ApiResponse = {
        success: result.success,
        data: {
          translatedText: result.translatedText,
          detectedLanguage: result.detectedLanguage,
          statusCode: result.statusCode,
          error: result.error
        },
        message: result.success ? 'Translation successful' : 'Translation failed'
      };

      return res.status(result.success ? 200 : result.statusCode || 500).json(response);
    } catch (error: any) {
      logger.error('Error in POST /api/translation/translate:', error);
      const response: ApiResponse = {
        success: false,
        error: error.message
      };
      return res.status(500).json(response);
    }
  });

  /**
   * POST /api/translation/translate-speech - Translate speech
   */
  router.post('/translate-speech', async (req, res) => {
    try {
      const { audioData, from, to, voice, outputFormat } = req.body as SpeechTranslationRequest;

      if (!audioData || !to) {
        const response: ApiResponse = {
          success: false,
          error: 'Audio data and target language (to) are required'
        };
        return res.status(400).json(response);
      }

      // Get a translation key - try eastasia first, then global
      let key = await translationKeyManager.getKey('eastasia');
      if (!key) {
        key = await translationKeyManager.getKey('global');
      }
      if (!key) {
        const response: ApiResponse = {
          success: false,
          error: 'No available translation keys'
        };
        return res.status(503).json(response);
      }

      // Convert base64 audio data to Buffer
      const audioBuffer = Buffer.from(audioData as unknown as string, 'base64');

      const speechRequest: SpeechTranslationRequest = {
        audioData: audioBuffer,
        from: from || 'en-US',
        to,
        voice,
        outputFormat
      };

      const result = await speechTranslationService.translateSpeech(key.key, key.region, speechRequest);

      // Log the result
      await translationKeyManager.setKeyStatus(key.key, result.statusCode || 500, 'Speech translation performed');

      const response: ApiResponse = {
        success: result.success,
        data: {
          translatedText: result.translatedText,
          detectedLanguage: result.detectedLanguage,
          statusCode: result.statusCode,
          error: result.error
        },
        message: result.success ? 'Speech translation successful' : 'Speech translation failed'
      };

      return res.status(result.success ? 200 : result.statusCode || 500).json(response);
    } catch (error: any) {
      logger.error('Error in POST /api/translation/translate-speech:', error);
      const response: ApiResponse = {
        success: false,
        error: error.message
      };
      return res.status(500).json(response);
    }
  });

  /**
   * GET /api/translation/keys - Get all translation keys
   */
  router.get('/keys', async (req, res) => {
    try {
      const keys = await translationKeyManager.getAllKeys();
      
      const response: ApiResponse = {
        success: true,
        data: keys,
        message: 'Translation keys retrieved successfully'
      };
      
      res.json(response);
    } catch (error: any) {
      logger.error('Error in GET /api/translation/keys:', error);
      const response: ApiResponse = {
        success: false,
        error: error.message
      };
      res.status(500).json(response);
    }
  });

  /**
   * GET /api/translation/keys/logs - Get translation key logs
   */
  router.get('/keys/logs', async (req, res) => {
    try {
      const page = parseInt(req.query.page as string) || 1;
      const limit = parseInt(req.query.limit as string) || 50;
      
      const result = await translationKeyManager.getKeyLogs(page, limit);
      
      const response: ApiResponse = {
        success: true,
        data: {
          logs: result.logs,
          total: result.total,
          page,
          limit,
          totalPages: Math.ceil(result.total / limit)
        },
        message: 'Translation key logs retrieved successfully'
      };
      
      res.json(response);
    } catch (error: any) {
      logger.error('Error in GET /api/translation/keys/logs:', error);
      const response: ApiResponse = {
        success: false,
        error: error.message
      };
      res.status(500).json(response);
    }
  });

  /**
   * POST /api/translation/keys/sync - Sync translation cooldown states
   */
  router.post('/keys/sync', async (req, res) => {
    try {
      await translationKeyManager.syncCooldownStates();

      const response: ApiResponse = {
        success: true,
        message: 'Translation cooldown states synchronized successfully'
      };

      return res.json(response);
    } catch (error: any) {
      logger.error('Error in POST /api/translation/keys/sync:', error);
      const response: ApiResponse = {
        success: false,
        error: error.message
      };
      return res.status(500).json(response);
    }
  });

  /**
   * POST /api/translation/keys/acquire-request - Acquire a request permit for concurrent control
   */
  router.post('/keys/acquire-request', async (req, res) => {
    try {
      const { key, maxConcurrentRequests = 10, requestTimeout = 30000 } = req.body;

      if (!key) {
        const response: ApiResponse = {
          success: false,
          error: 'Key is required'
        };
        return res.status(400).json(response);
      }

      // Note: Concurrency management is handled by the cooldown system
      // For now, we'll proceed without explicit concurrency control

      const response: ApiResponse = {
        success: true,
        data: { requestId: 'mock-request-id' },
        message: 'Request permit acquired successfully (mock)'
      };

      return res.json(response);
    } catch (error: any) {
      logger.error('Error in POST /api/translation/keys/acquire-request:', error);
      const response: ApiResponse = {
        success: false,
        error: error.message
      };
      return res.status(500).json(response);
    }
  });

  /**
   * POST /api/translation/keys/release-request - Release a request permit
   */
  router.post('/keys/release-request', async (req, res) => {
    try {
      const { key, requestId } = req.body;

      if (!key || !requestId) {
        const response: ApiResponse = {
          success: false,
          error: 'Key and requestId are required'
        };
        return res.status(400).json(response);
      }

      // Mock release for compatibility
      const released = true;

      const response: ApiResponse = {
        success: true,
        data: { released },
        message: 'Request permit released successfully (mock)'
      };

      return res.json(response);
    } catch (error: any) {
      logger.error('Error in POST /api/translation/keys/release-request:', error);
      const response: ApiResponse = {
        success: false,
        error: error.message
      };
      return res.status(500).json(response);
    }
  });

  /**
   * PUT /api/translation/keys/:key/enable - Enable a translation key
   */
  router.put('/keys/:key/enable', async (req, res) => {
    try {
      const { key } = req.params;

      if (!key) {
        const response: ApiResponse = {
          success: false,
          error: 'Key is required'
        };
        return res.status(400).json(response);
      }

      await translationKeyManager.enableKey(key);

      const response: ApiResponse = {
        success: true,
        message: 'Translation key enabled successfully'
      };

      return res.json(response);
    } catch (error: any) {
      logger.error('Error in PUT /api/translation/keys/:key/enable:', error);
      const response: ApiResponse = {
        success: false,
        error: error.message
      };
      return res.status(500).json(response);
    }
  });

  /**
   * PUT /api/translation/keys/:key/disable - Disable a translation key
   */
  router.put('/keys/:key/disable', async (req, res) => {
    try {
      const { key } = req.params;

      if (!key) {
        const response: ApiResponse = {
          success: false,
          error: 'Key is required'
        };
        return res.status(400).json(response);
      }

      await translationKeyManager.disableKey(key);

      const response: ApiResponse = {
        success: true,
        message: 'Translation key disabled successfully'
      };

      return res.json(response);
    } catch (error: any) {
      logger.error('Error in PUT /api/translation/keys/:key/disable:', error);
      const response: ApiResponse = {
        success: false,
        error: error.message
      };
      return res.status(500).json(response);
    }
  });

  /**
   * GET /api/translation/keys/stats - Get translation key statistics
   */
  router.get('/keys/stats', async (req, res) => {
    try {
      const cooldownManager = translationKeyManager.getCooldownManager();
      
      const cooldownStats = await cooldownManager.getStats();
      const cooldownKeys = await cooldownManager.getCooldownKeys();
      const concurrencyStats = { totalActiveRequests: 0, keyStats: {} }; // Mock concurrency stats

      const response: ApiResponse = {
        success: true,
        data: {
          cooldown: cooldownStats,
          cooldownKeys: cooldownKeys,
          concurrency: concurrencyStats
        },
        message: 'Translation key statistics retrieved successfully'
      };

      res.json(response);
    } catch (error: any) {
      logger.error('Error in GET /api/translation/keys/stats:', error);
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
