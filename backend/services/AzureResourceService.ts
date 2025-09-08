import axios from 'axios';
import logger from '../utils/logger';
import { AzureServicePrincipal, AzureResourceCreationRequest, AzureResourceCreationResponse } from '../types';

export class AzureResourceService {
  private accessToken: string | null = null;
  private tokenExpiry: number = 0;

  /**
   * 获取Azure访问令牌
   */
  async authenticate(credentials: AzureServicePrincipal): Promise<string> {
    // 如果令牌还有效，直接返回
    if (this.accessToken && Date.now() < this.tokenExpiry) {
      return this.accessToken;
    }

    try {
      const tokenUrl = `https://login.microsoftonline.com/${credentials.tenant}/oauth2/token`;
      const response = await axios.post(tokenUrl, new URLSearchParams({
        grant_type: 'client_credentials',
        client_id: credentials.appId,
        client_secret: credentials.password,
        resource: 'https://management.azure.com/'
      }), {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded'
        }
      });

      this.accessToken = response.data.access_token;
      // 提前5分钟过期
      this.tokenExpiry = Date.now() + (parseInt(response.data.expires_in) - 300) * 1000;
      
      logger.info('Azure access token obtained successfully');
      return this.accessToken!;
    } catch (error: any) {
      logger.error('Failed to get Azure access token:', error.response?.data || error.message);
      throw new Error(`获取Azure访问令牌失败: ${error.response?.data?.error_description || error.message}`);
    }
  }

  /**
   * 获取当前访问令牌
   */
  getAccessToken(): string | null {
    return this.accessToken;
  }

  /**
   * 创建Azure资源
   */
  async createResource(request: AzureResourceCreationRequest): Promise<AzureResourceCreationResponse> {
    try {
      // 首先进行身份验证
      const accessToken = await this.authenticate(request.credentials);
      
      // 从配置中获取参数，设置默认值
      const subscriptionId = request.resourceConfig.subscriptionId || '';
      const resourceGroupName = request.resourceConfig.resourceGroupName || `rg-${request.resourceType}-${Date.now()}`;
      const resourceName = request.resourceConfig.resourceName || `${request.resourceType}-${Date.now()}`;
      const location = request.resourceConfig.location || 'eastus';
      const sku = request.resourceConfig.sku || 'F0';
      
      // 检查资源组是否存在，如果不存在且需要创建则创建资源组
      if (request.options?.createResourceGroup) {
        await this.ensureResourceGroup(accessToken, subscriptionId, resourceGroupName, location);
      }

      // 创建认知服务资源
      const resourceUrl = `https://management.azure.com/subscriptions/${subscriptionId}/resourceGroups/${resourceGroupName}/providers/Microsoft.CognitiveServices/accounts/${resourceName}?api-version=2023-05-01`;
      
      const resourcePayload = {
        location: location,
        sku: {
          name: sku
        },
        kind: request.resourceType === 'speech' ? 'SpeechServices' : 'TextTranslation',
        properties: {
          customSubDomainName: resourceName
        }
      };

      const createResponse = await axios.put(resourceUrl, resourcePayload, {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        }
      });

      // 获取资源密钥
      const keysUrl = `https://management.azure.com/subscriptions/${subscriptionId}/resourceGroups/${resourceGroupName}/providers/Microsoft.CognitiveServices/accounts/${resourceName}/listKeys?api-version=2023-05-01`;
      
      const keysResponse = await axios.post(keysUrl, {}, {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        }
      });

      const keys = keysResponse.data;
      const endpoint = createResponse.data.properties.endpoint;

      logger.info(`Azure resource created successfully: ${resourceName}`);
      
      return {
        success: true,
        data: {
          resourceId: createResponse.data.id,
          resourceName: resourceName,
          resourceGroup: resourceGroupName,
          location: location,
          keys: {
            key1: keys.key1,
            key2: keys.key2
          },
          endpoint: endpoint,
          subscriptionId: subscriptionId
        },
        message: `资源 ${resourceName} 创建成功`
      };
    } catch (error: any) {
      logger.error('Failed to create Azure resource:', error.response?.data || error.message);
      throw new Error(`创建Azure资源失败: ${error.response?.data?.error?.message || error.message}`);
    }
  }

  /**
   * 确保资源组存在
   */
  private async ensureResourceGroup(accessToken: string, subscriptionId: string, resourceGroupName: string, location: string): Promise<void> {
    try {
      const resourceGroupUrl = `https://management.azure.com/subscriptions/${subscriptionId}/resourcegroups/${resourceGroupName}?api-version=2021-04-01`;
      
      // 检查资源组是否存在
      try {
        await axios.get(resourceGroupUrl, {
          headers: {
            'Authorization': `Bearer ${accessToken}`
          }
        });
        logger.info(`Resource group ${resourceGroupName} already exists`);
        return;
      } catch (error: any) {
        if (error.response?.status !== 404) {
          throw error;
        }
      }

      // 创建资源组
      await axios.put(resourceGroupUrl, {
        location: location
      }, {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        }
      });

      logger.info(`Resource group ${resourceGroupName} created successfully`);
    } catch (error: any) {
      logger.error('Failed to ensure resource group:', error.response?.data || error.message);
      throw new Error(`资源组操作失败: ${error.response?.data?.error?.message || error.message}`);
    }
  }
}