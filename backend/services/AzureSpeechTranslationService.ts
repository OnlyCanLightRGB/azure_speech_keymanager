import axios, { AxiosResponse } from 'axios';
import { TranslationRequest, TranslationResponse, TranslationTestRequest } from '../types';
import logger from '../utils/logger';

export interface SpeechTranslationRequest {
  audioData: Buffer;
  from: string;
  to: string;
  voice?: string;
  outputFormat?: string;
}

export interface SpeechTranslationResponse {
  success: boolean;
  translatedText?: string;
  translatedAudio?: Buffer;
  detectedLanguage?: string;
  error?: string;
  statusCode?: number;
  rawResponse?: any;
}

export class AzureSpeechTranslationService {
  private readonly defaultApiVersion = '2024-11-15';

  /**
   * Translate speech using Azure Speech Translation API
   */
  async translateSpeech(
    key: string,
    region: string,
    request: SpeechTranslationRequest
  ): Promise<SpeechTranslationResponse> {
    try {
      const endpoint = `https://${region}.stt.speech.microsoft.com/speechtotext/v3.1/translate`;
      const apiVersion = this.defaultApiVersion;
      
      const params: any = {
        'api-version': apiVersion,
        'from': request.from,
        'to': request.to
      };

      if (request.voice) {
        params['voice'] = request.voice;
      }

      const headers = {
        'Ocp-Apim-Subscription-Key': key,
        'Content-Type': 'audio/wav',
        'Accept': 'application/json',
        'X-ClientTraceId': this.generateTraceId()
      };

      const response: AxiosResponse = await axios.post(endpoint, request.audioData, {
        params,
        headers,
        timeout: 60000
      });

      if (response.status === 200) {
        return {
          success: true,
          translatedText: response.data?.DisplayText || '',
          detectedLanguage: response.data?.DetectedLanguage || '',
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
      logger.error('Speech translation error:', error);
      
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
   * Test a speech translation key
   */
  async testKey(
    key: string,
    region: string,
    audioData: Buffer,
    from: string = 'en-US',
    to: string = 'zh-CN'
  ): Promise<SpeechTranslationResponse> {
    const request: SpeechTranslationRequest = {
      audioData,
      from,
      to
    };

    return await this.translateSpeech(key, region, request);
  }

  /**
   * Test a speech translation key with custom parameters
   */
  async testKeyWithParams(
    key: string,
    region: string,
    request: {
      audioData: Buffer;
      from?: string;
      to?: string;
      voice?: string;
    }
  ): Promise<SpeechTranslationResponse> {
    const from = request.from || 'en-US';
    const to = request.to || 'zh-CN';

    const speechRequest: SpeechTranslationRequest = {
      audioData: request.audioData,
      from,
      to,
      voice: request.voice
    };

    return await this.translateSpeech(key, region, speechRequest);
  }

  /**
   * Generate a unique trace ID for request tracking
   */
  private generateTraceId(): string {
    return `speech-translation-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }
}

export default AzureSpeechTranslationService;
