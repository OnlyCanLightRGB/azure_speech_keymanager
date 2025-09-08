import axios, { AxiosResponse } from 'axios';
import { TranslationRequest, TranslationResponse, TranslationTestRequest } from '../types';
import logger from '../utils/logger';

export class AzureTranslationService {
  private readonly defaultApiVersion = '3.0';

  /**
   * Translate text using Azure Translator API
   */
  async translate(
    key: string,
    region: string,
    request: TranslationRequest
  ): Promise<TranslationResponse> {
    try {
      const endpoint = `https://api.cognitive.microsofttranslator.com/translate`;
      const apiVersion = request.apiVersion || this.defaultApiVersion;
      
      const params: any = {
        'api-version': apiVersion,
        'to': request.to
      };

      if (request.from) {
        params['from'] = request.from;
      }

      const headers = {
        'Ocp-Apim-Subscription-Key': key,
        'Ocp-Apim-Subscription-Region': region,
        'Content-Type': 'application/json',
        'X-ClientTraceId': this.generateTraceId()
      };

      const body = [
        {
          'text': request.text
        }
      ];

      const response: AxiosResponse = await axios.post(endpoint, body, {
        params,
        headers,
        timeout: 30000
      });

      if (response.status === 200 && response.data && response.data.length > 0) {
        const translation = response.data[0];
        return {
          success: true,
          translatedText: translation.translations?.[0]?.text || '',
          detectedLanguage: translation.detectedLanguage?.language || '',
          statusCode: response.status,
          rawResponse: response.data
        };
      } else {
        return {
          success: false,
          error: 'Invalid response format',
          statusCode: response.status,
          rawResponse: response.data
        };
      }

    } catch (error: any) {
      logger.error('Translation error:', error);
      
      if (error.response) {
        return {
          success: false,
          error: error.response.data?.error?.message || error.message,
          statusCode: error.response.status,
          rawResponse: error.response.data
        };
      } else if (error.request) {
        return {
          success: false,
          error: 'Network error: No response received',
          statusCode: 0
        };
      } else {
        return {
          success: false,
          error: error.message,
          statusCode: 500
        };
      }
    }
  }

  /**
   * Test a translation key
   */
  async testKey(
    key: string,
    region: string,
    testText: string = 'Hello world',
    from: string = 'en',
    to: string = 'zh-Hans'
  ): Promise<TranslationResponse> {
    const request: TranslationRequest = {
      text: testText,
      from,
      to
    };

    return await this.translate(key, region, request);
  }

  /**
   * Test a translation key with custom parameters
   */
  async testKeyWithParams(request: TranslationTestRequest): Promise<TranslationResponse> {
    const testText = request.text || 'Hello world';
    const from = request.from || 'en';
    const to = request.to || 'zh-Hans';

    return await this.testKey(request.key, request.region, testText, from, to);
  }

  /**
   * Generate a unique trace ID for request tracking
   */
  private generateTraceId(): string {
    return `translation-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }
}

export default AzureTranslationService;
