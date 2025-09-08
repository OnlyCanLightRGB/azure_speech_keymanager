import { AzureCLIService, AzureCLIConfig } from './AzureCLIService';
import logger from '../utils/logger';

export interface EndpointConfig {
  name: string;
  url: string;
  region: string;
  type: 'speech' | 'translation' | 'both';
  priority: number;
  enabled: boolean;
  healthCheck: boolean;
}

export interface EnhancedConfig {
  azureCLI: AzureCLIConfig;
  endpoints: {
    speech: EndpointConfig[];
    translation: EndpointConfig[];
  };
  autoDiscovery: {
    enabled: boolean;
    interval: number; // 分钟
    lastRun: Date | null;
  };
  quotaManagement: {
    enabled: boolean;
    warningThreshold: number; // 百分比
    autoDisableThreshold: number; // 百分比
  };
}

export class EnhancedConfigService {
  private config: EnhancedConfig;
  private azureCLI: AzureCLIService | null = null;
  private healthCheckInterval: NodeJS.Timeout | null = null;

  constructor() {
    this.config = this.loadConfig();
    this.initializeAzureCLI();
    this.startHealthChecks();
  }

  /**
   * 加载配置
   */
  private loadConfig(): EnhancedConfig {
    const config: EnhancedConfig = {
      azureCLI: {
        appId: process.env.AZURE_APP_ID || '',
        password: process.env.AZURE_PASSWORD || '',
        tenant: process.env.AZURE_TENANT || '',
        displayName: process.env.AZURE_DISPLAY_NAME || ''
      },
      endpoints: {
        speech: [
          {
            name: 'Default Speech',
            url: 'https://{region}.cognitiveservices.azure.com',
            region: 'eastasia',
            type: 'speech',
            priority: 1,
            enabled: true,
            healthCheck: true
          },
          {
            name: 'Custom Speech Endpoint',
            url: process.env.AZURE_SPEECH_ENDPOINT || 'https://eastasia.api.cognitive.microsoft.com',
            region: 'eastasia',
            type: 'speech',
            priority: 2,
            enabled: true,
            healthCheck: true
          }
        ],
        translation: [
          {
            name: 'Default Translator',
            url: 'https://api.cognitive.microsofttranslator.com',
            region: 'global',
            type: 'translation',
            priority: 1,
            enabled: true,
            healthCheck: true
          },
          {
            name: 'Custom Translator Endpoint',
            url: process.env.AZURE_TRANSLATOR_ENDPOINT || 'https://api.cognitive.microsofttranslator.com',
            region: 'eastasia',
            type: 'translation',
            priority: 2,
            enabled: true,
            healthCheck: true
          }
        ]
      },
      autoDiscovery: {
        enabled: process.env.AZURE_AUTO_DISCOVERY === 'true',
        interval: parseInt(process.env.AZURE_DISCOVERY_INTERVAL || '60'), // 60分钟
        lastRun: null
      },
      quotaManagement: {
        enabled: process.env.AZURE_QUOTA_MANAGEMENT === 'true',
        warningThreshold: parseInt(process.env.AZURE_WARNING_THRESHOLD || '80'), // 80%
        autoDisableThreshold: parseInt(process.env.AZURE_DISABLE_THRESHOLD || '95') // 95%
      }
    };

    logger.info('Enhanced configuration loaded');
    return config;
  }

  /**
   * 初始化Azure CLI服务
   */
  private initializeAzureCLI(): void {
    if (this.config.azureCLI.appId && this.config.azureCLI.password && this.config.azureCLI.tenant) {
      try {
        this.azureCLI = new AzureCLIService(this.config.azureCLI);
        logger.info('Azure CLI service initialized successfully');
      } catch (error) {
        logger.error('Failed to initialize Azure CLI service:', error);
      }
    } else {
      logger.warn('Azure CLI credentials not provided, auto-discovery disabled');
    }
  }

  /**
   * 启动健康检查
   */
  private startHealthChecks(): void {
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
    }

    // 每5分钟检查一次端点健康状态
    this.healthCheckInterval = setInterval(async () => {
      await this.performHealthChecks();
    }, 5 * 60 * 1000);

    logger.info('Health check service started');
  }

  /**
   * 执行健康检查
   */
  private async performHealthChecks(): Promise<void> {
    const allEndpoints = [...this.config.endpoints.speech, ...this.config.endpoints.translation];
    
    for (const endpoint of allEndpoints) {
      if (endpoint.healthCheck && endpoint.enabled) {
        try {
          const isHealthy = await this.checkEndpointHealth(endpoint);
          if (!isHealthy) {
            logger.warn(`Endpoint ${endpoint.name} is unhealthy`);
            // 可以在这里实现故障转移逻辑
          }
        } catch (error) {
          logger.error(`Health check failed for endpoint ${endpoint.name}:`, error);
        }
      }
    }
  }

  /**
   * 检查端点健康状态
   */
  private async checkEndpointHealth(endpoint: EndpointConfig): Promise<boolean> {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000);
      
      try {
        let response;
        
        if (endpoint.type === 'translation') {
          // 翻译服务使用特定的健康检查端点
          const healthUrl = `${endpoint.url}/languages?api-version=3.0`;
          response = await fetch(healthUrl, {
            method: 'GET',
            signal: controller.signal,
            headers: {
              'Accept': 'application/json'
            }
          });
        } else {
          // 语音服务使用HEAD请求
          const testUrl = endpoint.url.replace('{region}', endpoint.region);
          response = await fetch(testUrl, { 
            method: 'HEAD',
            signal: controller.signal
          });
        }
        
        clearTimeout(timeoutId);
        return response.ok;
      } catch (error) {
        clearTimeout(timeoutId);
        return false;
      }
    } catch (error) {
      return false;
    }
  }

  /**
   * 获取最佳端点
   */
  getBestEndpoint(type: 'speech' | 'translation', region?: string): EndpointConfig | null {
    const endpoints = this.config.endpoints[type];
    const availableEndpoints = endpoints.filter(ep => ep.enabled);
    
    if (availableEndpoints.length === 0) {
      return null;
    }

    // 按优先级排序
    availableEndpoints.sort((a, b) => a.priority - b.priority);
    
    // 如果指定了区域，优先选择匹配的端点
    if (region) {
      const regionalEndpoint = availableEndpoints.find(ep => ep.region === region);
      if (regionalEndpoint) {
        return regionalEndpoint;
      }
    }

    return availableEndpoints[0];
  }

  /**
   * 构建完整的API URL
   */
  buildApiUrl(endpoint: EndpointConfig, apiPath: string): string {
    let baseUrl = endpoint.url.replace('{region}', endpoint.region);
    
    // 确保URL以/结尾
    if (!baseUrl.endsWith('/')) {
      baseUrl += '/';
    }
    
    // 移除apiPath开头的/
    const cleanApiPath = apiPath.startsWith('/') ? apiPath.slice(1) : apiPath;
    
    return `${baseUrl}${cleanApiPath}`;
  }

  /**
   * 执行自动发现
   */
  async performAutoDiscovery(): Promise<{
    speech: Array<{ key: string; region: string; name: string }>;
    translation: Array<{ key: string; region: string; name: string }>;
  }> {
    if (!this.azureCLI || !this.config.autoDiscovery.enabled) {
      logger.warn('Auto-discovery is disabled or Azure CLI not available');
      return { speech: [], translation: [] };
    }

    try {
      logger.info('Starting auto-discovery of Azure Cognitive Services');
      const discoveredKeys = await this.azureCLI.autoDiscoverKeys();
      
      this.config.autoDiscovery.lastRun = new Date();
      logger.info(`Auto-discovery completed: ${discoveredKeys.speech.length} speech keys, ${discoveredKeys.translation.length} translation keys found`);
      
      return discoveredKeys;
    } catch (error) {
      logger.error('Auto-discovery failed:', error);
      return { speech: [], translation: [] };
    }
  }

  /**
   * 检查配额使用情况
   */
  async checkQuotaUsage(subscriptionId: string, resourceId: string): Promise<{
    usage: number;
    limit: number;
    percentage: number;
    status: 'normal' | 'warning' | 'critical';
  }> {
    if (!this.azureCLI || !this.config.quotaManagement.enabled) {
      return { usage: 0, limit: 0, percentage: 0, status: 'normal' };
    }

    try {
      const usage = await this.azureCLI.getResourceUsage(subscriptionId, resourceId);
      
      // 这里需要根据实际的Azure API响应格式来解析使用情况
      // 简化示例
      const totalCalls = usage.value?.[0]?.timeseries?.[0]?.data?.[0]?.total || 0;
      const limit = 10000; // 示例限制，实际应该从Azure获取
      const percentage = (totalCalls / limit) * 100;

      let status: 'normal' | 'warning' | 'critical' = 'normal';
      if (percentage >= this.config.quotaManagement.autoDisableThreshold) {
        status = 'critical';
      } else if (percentage >= this.config.quotaManagement.warningThreshold) {
        status = 'warning';
      }

      return { usage: totalCalls, limit, percentage, status };
    } catch (error) {
      logger.error('Failed to check quota usage:', error);
      return { usage: 0, limit: 0, percentage: 0, status: 'normal' };
    }
  }

  /**
   * 获取配置信息
   */
  getConfig(): EnhancedConfig {
    return { ...this.config };
  }

  /**
   * 更新端点配置
   */
  updateEndpointConfig(type: 'speech' | 'translation', endpointName: string, updates: Partial<EndpointConfig>): boolean {
    const endpointIndex = this.config.endpoints[type].findIndex(ep => ep.name === endpointName);
    if (endpointIndex === -1) {
      return false;
    }

    this.config.endpoints[type][endpointIndex] = {
      ...this.config.endpoints[type][endpointIndex],
      ...updates
    };

    logger.info(`Updated endpoint config: ${type}/${endpointName}`);
    return true;
  }

  /**
   * 添加新端点
   */
  addEndpoint(type: 'speech' | 'translation', endpoint: EndpointConfig): void {
    this.config.endpoints[type].push(endpoint);
    logger.info(`Added new endpoint: ${type}/${endpoint.name}`);
  }

  /**
   * 清理资源
   */
  cleanup(): void {
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
      this.healthCheckInterval = null;
    }
    logger.info('Enhanced config service cleaned up');
  }
}
