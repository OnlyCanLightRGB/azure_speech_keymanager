import axios, { AxiosResponse } from 'axios';
import logger from '../utils/logger';

export interface AzureCLIConfig {
  appId: string;
  password: string;
  tenant: string;
  displayName?: string;
}

export interface AzureResource {
  id: string;
  name: string;
  type: string;
  location: string;
  properties: any;
}

export interface AzureSubscription {
  id: string;
  subscriptionId: string;
  displayName: string;
  state: string;
}

export interface AzureCognitiveService {
  id: string;
  name: string;
  type: string;
  location: string;
  sku: {
    name: string;
    tier: string;
  };
  properties: {
    endpoint: string;
    apiProperties?: {
      qnaRuntimeEndpoint?: string;
    };
  };
}

export class AzureCLIService {
  private config: AzureCLIConfig;
  private accessToken: string | null = null;
  private tokenExpiry: number = 0;

  constructor(config: AzureCLIConfig) {
    this.config = config;
  }

  /**
   * 获取Azure访问令牌
   */
  private async getAccessToken(): Promise<string> {
    const now = Date.now();
    
    // 如果令牌还有效，直接返回
    if (this.accessToken && now < this.tokenExpiry) {
      return this.accessToken!;
    }

    try {
      const tokenUrl = `https://login.microsoftonline.com/${this.config.tenant}/oauth2/token`;
      const tokenData = new URLSearchParams({
        grant_type: 'client_credentials',
        client_id: this.config.appId,
        client_secret: this.config.password,
        resource: 'https://management.azure.com/'
      });

      const response: AxiosResponse = await axios.post(tokenUrl, tokenData, {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded'
        },
        timeout: 10000
      });

      if (response.status === 200) {
        this.accessToken = response.data.access_token;
        // 令牌有效期通常是1小时，提前5分钟刷新
        this.tokenExpiry = now + (response.data.expires_in - 300) * 1000;
        
        logger.info('Azure access token obtained successfully');
        return this.accessToken!;
      } else {
        throw new Error(`Failed to get access token: ${response.status}`);
      }
    } catch (error: any) {
      logger.error('Error getting Azure access token:', error);
      throw new Error(`Authentication failed: ${error.message}`);
    }
  }

  /**
   * 获取Azure订阅列表
   */
  async getSubscriptions(): Promise<AzureSubscription[]> {
    try {
      const token = await this.getAccessToken();
      const response: AxiosResponse = await axios.get(
        'https://management.azure.com/subscriptions?api-version=2020-01-01',
        {
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          },
          timeout: 10000
        }
      );

      if (response.status === 200) {
        return response.data.value.map((sub: any) => ({
          id: sub.id,
          subscriptionId: sub.subscriptionId,
          displayName: sub.displayName,
          state: sub.state
        }));
      } else {
        throw new Error(`Failed to get subscriptions: ${response.status}`);
      }
    } catch (error: any) {
      logger.error('Error getting Azure subscriptions:', error);
      throw error;
    }
  }

  /**
   * 获取认知服务资源列表
   */
  async getCognitiveServices(subscriptionId: string): Promise<AzureCognitiveService[]> {
    try {
      const token = await this.getAccessToken();
      const response: AxiosResponse = await axios.get(
        `https://management.azure.com/subscriptions/${subscriptionId}/providers/Microsoft.CognitiveServices/accounts?api-version=2023-05-01`,
        {
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          },
          timeout: 10000
        }
      );

      if (response.status === 200) {
        return response.data.value.map((service: any) => ({
          id: service.id,
          name: service.name,
          type: service.type,
          location: service.location,
          sku: service.sku,
          properties: service.properties
        }));
      } else {
        throw new Error(`Failed to get cognitive services: ${response.status}`);
      }
    } catch (error: any) {
      logger.error('Error getting cognitive services:', error);
      throw error;
    }
  }

  /**
   * 获取认知服务的密钥
   */
  async getCognitiveServiceKeys(subscriptionId: string, resourceGroup: string, serviceName: string): Promise<{
    key1?: string;
    key2?: string;
  }> {
    try {
      const token = await this.getAccessToken();
      const response: AxiosResponse = await axios.post(
        `https://management.azure.com/subscriptions/${subscriptionId}/resourceGroups/${resourceGroup}/providers/Microsoft.CognitiveServices/accounts/${serviceName}/listKeys?api-version=2023-05-01`,
        {},
        {
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          },
          timeout: 10000
        }
      );

      if (response.status === 200) {
        return {
          key1: response.data.key1,
          key2: response.data.key2
        };
      } else {
        throw new Error(`Failed to get service keys: ${response.status}`);
      }
    } catch (error: any) {
      logger.error('Error getting cognitive service keys:', error);
      throw error;
    }
  }

  /**
   * 获取资源使用情况
   */
  async getResourceUsage(subscriptionId: string, resourceId: string): Promise<any> {
    try {
      const token = await this.getAccessToken();
      const now = new Date();
      const startTime = new Date(now.getTime() - 24 * 60 * 60 * 1000); // 24小时前
      
      const response: AxiosResponse = await axios.get(
        `https://management.azure.com${resourceId}/providers/microsoft.insights/metrics?api-version=2018-01-01&timespan=${startTime.toISOString()}/${now.toISOString()}&interval=PT1H&metricnames=TotalCalls,TotalErrors`,
        {
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          },
          timeout: 10000
        }
      );

      if (response.status === 200) {
        return response.data;
      } else {
        throw new Error(`Failed to get resource usage: ${response.status}`);
      }
    } catch (error: any) {
      logger.error('Error getting resource usage:', error);
      throw error;
    }
  }

  /**
   * 检查服务状态
   */
  async checkServiceHealth(subscriptionId: string, resourceId: string): Promise<{
    status: string;
    details: any;
  }> {
    try {
      const token = await this.getAccessToken();
      const response: AxiosResponse = await axios.get(
        `https://management.azure.com${resourceId}?api-version=2023-05-01`,
        {
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          },
          timeout: 10000
        }
      );

      if (response.status === 200) {
        return {
          status: 'healthy',
          details: response.data
        };
      } else {
        return {
          status: 'unhealthy',
          details: { error: `HTTP ${response.status}` }
        };
      }
    } catch (error: any) {
      logger.error('Error checking service health:', error);
      return {
        status: 'error',
        details: { error: error.message }
      };
    }
  }

  /**
   * 自动发现和添加认知服务密钥
   */
  async autoDiscoverKeys(): Promise<{
    speech: Array<{ key: string; region: string; name: string }>;
    translation: Array<{ key: string; region: string; name: string }>;
  }> {
    try {
      const subscriptions = await this.getSubscriptions();
      const activeSubscriptions = subscriptions.filter(sub => sub.state === 'Enabled');
      
      const speechKeys: Array<{ key: string; region: string; name: string }> = [];
      const translationKeys: Array<{ key: string; region: string; name: string }> = [];

      for (const subscription of activeSubscriptions) {
        const services = await this.getCognitiveServices(subscription.subscriptionId);
        
        for (const service of services) {
          // 检查是否是语音或翻译服务
          if (service.sku.name.includes('S') || service.sku.name.includes('F0') || service.sku.name.includes('S0')) {
            try {
              const resourceGroup = service.id.split('/')[4];
              const keys = await this.getCognitiveServiceKeys(
                subscription.subscriptionId,
                resourceGroup,
                service.name
              );

              if (keys.key1) {
                const keyInfo = {
                  key: keys.key1,
                  region: service.location,
                  name: service.name
                };

                // 根据服务类型分类
                if (service.name.toLowerCase().includes('speech') || 
                    service.name.toLowerCase().includes('tts') ||
                    service.name.toLowerCase().includes('asr')) {
                  speechKeys.push(keyInfo);
                } else if (service.name.toLowerCase().includes('translator') ||
                          service.name.toLowerCase().includes('translation')) {
                  translationKeys.push(keyInfo);
                }
              }
            } catch (error) {
              logger.warn(`Failed to get keys for service ${service.name}:`, error);
            }
          }
        }
      }

      return { speech: speechKeys, translation: translationKeys };
    } catch (error: any) {
      logger.error('Error in auto discovery:', error);
      throw error;
    }
  }
}
