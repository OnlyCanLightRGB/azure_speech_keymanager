import axios, { AxiosResponse } from 'axios';
import { AzureSTTRequest, AzureSTTResponse } from '../types';
import logger from '../utils/logger';

export class AzureSTTService {
  private readonly baseUrl = 'https://{region}.stt.speech.microsoft.com/speech/recognition/conversation/cognitiveservices/v1';

  /**
   * Test a key by making an STT request with simulated audio data
   */
  async testKey(key: string, region: string): Promise<AzureSTTResponse> {
    try {
      const url = this.baseUrl.replace('{region}', region);
      
      // Generate simple test audio data (WAV format)
      const audioData = this.generateTestAudioData();
      
      const response: AxiosResponse = await axios.post(url, audioData, {
        headers: {
          'Ocp-Apim-Subscription-Key': key,
          'Content-Type': 'audio/wav; codecs=audio/pcm; samplerate=16000',
          'Accept': 'application/json',
          'User-Agent': 'Azure-Speech-KeyManager/1.0'
        },
        params: {
          'language': 'en-US',
          'format': 'detailed'
        },
        timeout: 10000, // 10 seconds timeout
        validateStatus: () => true // Don't throw on non-2xx status codes
      });

      if (response.status === 200) {
        const result = response.data;

        // Log the full response for debugging
        logger.info(`STT response data: ${JSON.stringify(result)}`);

        // Extract transcription from Azure STT response
        // Azure STT can return different formats depending on the request
        let transcription = 'No transcription available';
        let recognitionStatus = 'Unknown';

        if (result) {
          // For detailed format
          if (result.DisplayText) {
            transcription = result.DisplayText;
            recognitionStatus = result.RecognitionStatus || 'Success';
          }
          // For simple format
          else if (result.Text) {
            transcription = result.Text;
            recognitionStatus = 'Success';
          }
          // For NBest results
          else if (result.NBest && result.NBest.length > 0) {
            transcription = result.NBest[0].Display || result.NBest[0].Lexical;
            recognitionStatus = 'Success';
          }
          // Fallback to RecognitionStatus
          else if (result.RecognitionStatus) {
            recognitionStatus = result.RecognitionStatus;
            transcription = result.RecognitionStatus === 'Success' ? 'Audio recognized successfully' : result.RecognitionStatus;
          }
        }

        logger.info(`STT test successful for key: ${this.maskKey(key)}, status: ${recognitionStatus}, transcription: ${transcription}`);

        return {
          success: true,
          transcription,
          recognitionStatus,
          statusCode: response.status,
          rawResponse: result // Include raw response for debugging
        };
      } else {
        logger.warn(`STT test failed for key: ${this.maskKey(key)}, status: ${response.status}`);
        
        let errorMessage = 'Unknown error';
        try {
          // Try to parse error response
          const errorText = typeof response.data === 'string' ? response.data : JSON.stringify(response.data);
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
      logger.error(`STT test error for key: ${this.maskKey(key)}:`, error.message);
      
      let statusCode = 500;
      let errorMessage = error.message;

      if (error.response) {
        statusCode = error.response.status;
        try {
          const errorText = typeof error.response.data === 'string' 
            ? error.response.data 
            : JSON.stringify(error.response.data);
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
   * Make a custom STT request
   */
  async recognizeSpeech(
    key: string, 
    region: string, 
    request: AzureSTTRequest
  ): Promise<AzureSTTResponse> {
    try {
      const url = this.baseUrl.replace('{region}', region);
      
      const language = request.language || 'en-US';
      const format = request.format || 'detailed';

      const response: AxiosResponse = await axios.post(url, request.audioData, {
        headers: {
          'Ocp-Apim-Subscription-Key': key,
          'Content-Type': 'audio/wav; codecs=audio/pcm; samplerate=16000',
          'Accept': 'application/json',
          'User-Agent': 'Azure-Speech-KeyManager/1.0'
        },
        params: {
          'language': language,
          'format': format
        },
        timeout: 30000, // 30 seconds timeout for longer audio
        validateStatus: () => true
      });

      if (response.status === 200) {
        const result = response.data;
        const transcription = result?.DisplayText || result?.RecognitionStatus || 'Recognition successful';
        
        logger.info(`STT recognition successful for key: ${this.maskKey(key)}, transcription: ${transcription}`);
        
        return {
          success: true,
          transcription,
          statusCode: response.status
        };
      } else {
        let errorMessage = 'Unknown error';
        try {
          const errorText = typeof response.data === 'string' ? response.data : JSON.stringify(response.data);
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
      logger.error(`STT recognition error for key: ${this.maskKey(key)}:`, error.message);
      
      let statusCode = 500;
      let errorMessage = error.message;

      if (error.response) {
        statusCode = error.response.status;
        try {
          const errorText = typeof error.response.data === 'string' 
            ? error.response.data 
            : JSON.stringify(error.response.data);
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
   * Generate simple test audio data in WAV format
   * This creates a minimal WAV file with silence for testing purposes
   */
  private generateTestAudioData(): Buffer {
    // WAV header for 16kHz, 16-bit, mono, 1 second of silence
    const sampleRate = 16000;
    const duration = 1; // 1 second
    const numSamples = sampleRate * duration;
    const dataSize = numSamples * 2; // 16-bit = 2 bytes per sample
    const fileSize = 44 + dataSize; // WAV header is 44 bytes

    const buffer = Buffer.alloc(fileSize);
    let offset = 0;

    // WAV header
    buffer.write('RIFF', offset); offset += 4;
    buffer.writeUInt32LE(fileSize - 8, offset); offset += 4;
    buffer.write('WAVE', offset); offset += 4;
    buffer.write('fmt ', offset); offset += 4;
    buffer.writeUInt32LE(16, offset); offset += 4; // PCM format chunk size
    buffer.writeUInt16LE(1, offset); offset += 2;  // PCM format
    buffer.writeUInt16LE(1, offset); offset += 2;  // Mono
    buffer.writeUInt32LE(sampleRate, offset); offset += 4;
    buffer.writeUInt32LE(sampleRate * 2, offset); offset += 4; // Byte rate
    buffer.writeUInt16LE(2, offset); offset += 2;  // Block align
    buffer.writeUInt16LE(16, offset); offset += 2; // Bits per sample
    buffer.write('data', offset); offset += 4;
    buffer.writeUInt32LE(dataSize, offset); offset += 4;

    // Fill with silence (zeros)
    buffer.fill(0, offset);

    return buffer;
  }

  /**
   * Mask key for logging
   */
  private maskKey(key: string): string {
    if (key.length <= 8) {
      return '*'.repeat(key.length);
    }
    return key.substring(0, 4) + '*'.repeat(key.length - 8) + key.substring(key.length - 4);
  }
}

export default AzureSTTService;
