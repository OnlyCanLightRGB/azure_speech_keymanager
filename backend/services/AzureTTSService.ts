import axios, { AxiosResponse } from 'axios';
import { AzureTTSRequest, AzureTTSResponse } from '../types';
import logger from '../utils/logger';

export class AzureTTSService {
  private readonly baseUrl = 'https://{region}.tts.speech.microsoft.com/cognitiveservices/v1';

  /**
   * Test a key by making a TTS request
   */
  async testKey(key: string, region: string): Promise<AzureTTSResponse> {
    try {
      const url = this.baseUrl.replace('{region}', region);
      
      // Test SSML content
      const ssml = `
        <speak version='1.0' xml:lang='en-US'>
          <voice xml:lang='en-US' xml:gender='Female' name='en-US-AriaNeural'>
            This is a test of Azure Speech Services.
          </voice>
        </speak>
      `;

      const response: AxiosResponse = await axios.post(url, ssml, {
        headers: {
          'Ocp-Apim-Subscription-Key': key,
          'Content-Type': 'application/ssml+xml',
          'X-Microsoft-OutputFormat': 'audio-16khz-128kbitrate-mono-mp3',
          'User-Agent': 'Azure-Speech-KeyManager/1.0'
        },
        responseType: 'arraybuffer',
        timeout: 10000, // 10 seconds timeout
        validateStatus: () => true // Don't throw on non-2xx status codes
      });

      if (response.status === 200) {
        const audioData = Buffer.from(response.data);
        logger.info(`TTS test successful for key: ${this.maskKey(key)}, audio size: ${audioData.length} bytes`);
        
        return {
          success: true,
          audioData,
          statusCode: response.status
        };
      } else {
        logger.warn(`TTS test failed for key: ${this.maskKey(key)}, status: ${response.status}`);
        
        let errorMessage = 'Unknown error';
        try {
          // Try to parse error response
          const errorText = Buffer.from(response.data).toString('utf-8');
          errorMessage = errorText || `HTTP ${response.status}`;
        } catch (e) {
          errorMessage = `HTTP ${response.status}`;
        }

        return {
          success: false,
          error: errorMessage,
          statusCode: response.status
        };
      }

    } catch (error: any) {
      logger.error(`TTS test error for key: ${this.maskKey(key)}:`, error.message);
      
      let statusCode = 500;
      let errorMessage = error.message;

      if (error.response) {
        statusCode = error.response.status;
        try {
          const errorText = Buffer.from(error.response.data).toString('utf-8');
          errorMessage = errorText || error.message;
        } catch (e) {
          errorMessage = error.message;
        }
      } else if (error.code === 'ECONNABORTED') {
        statusCode = 408; // Request timeout
        errorMessage = 'Request timeout';
      } else if (error.code === 'ENOTFOUND' || error.code === 'ECONNREFUSED') {
        statusCode = 503; // Service unavailable
        errorMessage = 'Service unavailable';
      }

      return {
        success: false,
        error: errorMessage,
        statusCode
      };
    }
  }

  /**
   * Make a custom TTS request
   */
  async synthesizeSpeech(
    key: string, 
    region: string, 
    request: AzureTTSRequest
  ): Promise<AzureTTSResponse> {
    try {
      const url = this.baseUrl.replace('{region}', region);
      
      // Build SSML
      const voice = request.voice || 'en-US-AriaNeural';
      const ssml = `
        <speak version='1.0' xml:lang='en-US'>
          <voice xml:lang='en-US' name='${voice}'>
            ${this.escapeXml(request.text)}
          </voice>
        </speak>
      `;

      const outputFormat = request.outputFormat || 'audio-16khz-128kbitrate-mono-mp3';

      const response: AxiosResponse = await axios.post(url, ssml, {
        headers: {
          'Ocp-Apim-Subscription-Key': key,
          'Content-Type': 'application/ssml+xml',
          'X-Microsoft-OutputFormat': outputFormat,
          'User-Agent': 'Azure-Speech-KeyManager/1.0'
        },
        responseType: 'arraybuffer',
        timeout: 30000, // 30 seconds timeout for longer texts
        validateStatus: () => true
      });

      if (response.status === 200) {
        const audioData = Buffer.from(response.data);
        logger.info(`TTS synthesis successful for key: ${this.maskKey(key)}, audio size: ${audioData.length} bytes`);
        
        return {
          success: true,
          audioData,
          statusCode: response.status
        };
      } else {
        let errorMessage = 'Unknown error';
        try {
          const errorText = Buffer.from(response.data).toString('utf-8');
          errorMessage = errorText || `HTTP ${response.status}`;
        } catch (e) {
          errorMessage = `HTTP ${response.status}`;
        }

        return {
          success: false,
          error: errorMessage,
          statusCode: response.status
        };
      }

    } catch (error: any) {
      logger.error(`TTS synthesis error for key: ${this.maskKey(key)}:`, error.message);
      
      let statusCode = 500;
      let errorMessage = error.message;

      if (error.response) {
        statusCode = error.response.status;
        try {
          const errorText = Buffer.from(error.response.data).toString('utf-8');
          errorMessage = errorText || error.message;
        } catch (e) {
          errorMessage = error.message;
        }
      } else if (error.code === 'ECONNABORTED') {
        statusCode = 408;
        errorMessage = 'Request timeout';
      } else if (error.code === 'ENOTFOUND' || error.code === 'ECONNREFUSED') {
        statusCode = 503;
        errorMessage = 'Service unavailable';
      }

      return {
        success: false,
        error: errorMessage,
        statusCode
      };
    }
  }

  /**
   * Get available voices for a region
   */
  async getAvailableVoices(key: string, region: string): Promise<any[]> {
    try {
      const url = `https://${region}.tts.speech.microsoft.com/cognitiveservices/voices/list`;
      
      const response = await axios.get(url, {
        headers: {
          'Ocp-Apim-Subscription-Key': key,
          'User-Agent': 'Azure-Speech-KeyManager/1.0'
        },
        timeout: 10000
      });

      return response.data;
    } catch (error: any) {
      logger.error(`Failed to get voices for key: ${this.maskKey(key)}:`, error.message);
      throw error;
    }
  }

  /**
   * Escape XML special characters
   */
  private escapeXml(text: string): string {
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;');
  }

  /**
   * Mask key for logging
   */
  private maskKey(key: string): string {
    if (key.length <= 8) {
      return key;
    }
    return key.substring(0, 8) + '...';
  }
}

export default AzureTTSService;
