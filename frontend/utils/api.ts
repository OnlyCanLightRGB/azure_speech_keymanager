import axios, { AxiosResponse } from 'axios';
import { 
  ApiResponse, 
  AzureKey, 
  KeyLog, 
  SystemConfig, 
  KeyStats, 
  LogsResponse,
  TestKeyResult,
  AddKeyForm,
  TestKeyForm,
  TranslationKey,
  ResourceKeyCreationResponse
} from '../types';

// Dynamic API URL detection for better Docker compatibility
const getApiBaseUrl = (): string => {
  // If NEXT_PUBLIC_API_URL is explicitly set, use it
  if (process.env.NEXT_PUBLIC_API_URL) {
    return process.env.NEXT_PUBLIC_API_URL;
  }

  // For client-side (browser), detect the current host and use backend port
  if (typeof window !== 'undefined') {
    const protocol = window.location.protocol;
    const hostname = window.location.hostname;
    // In Docker deployment, backend runs on port 3019
    return `${protocol}//${hostname}:3019`;
  }

  // For server-side rendering, use empty string (relative path)
  return '';
};

const API_BASE_URL = getApiBaseUrl();

// Debug logging for Docker deployment
console.log('API Configuration:', {
  NODE_ENV: process.env.NODE_ENV,
  NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL,
  API_BASE_URL,
  isClient: typeof window !== 'undefined',
  currentHost: typeof window !== 'undefined' ? window.location.host : 'server-side'
});

// Create axios instance
const api = axios.create({
  baseURL: API_BASE_URL,
  timeout: 30000,
  headers: {
    'Content-Type': 'application/json'
  }
});

// Request interceptor
api.interceptors.request.use(
  (config) => {
    console.log(`API Request: ${config.method?.toUpperCase()} ${config.baseURL}${config.url}`);
    return config;
  },
  (error) => {
    console.error('API Request Error:', error);
    return Promise.reject(error);
  }
);

// Response interceptor
api.interceptors.response.use(
  (response: AxiosResponse<ApiResponse>) => {
    console.log(`API Response: ${response.status} ${response.config.url}`);
    return response;
  },
  (error) => {
    const errorMessage = error.response?.data?.error || error.message || 'Network error';
    const statusCode = error.response?.status || 0;

    console.error(`API Response Error [${statusCode}]:`, errorMessage);

    // For Docker deployment debugging
    if (statusCode === 0 || error.code === 'ECONNREFUSED') {
      console.error('Connection failed. Check if backend is running on the correct port.');
      console.error('Current API Base URL:', API_BASE_URL);
    }

    return Promise.reject(error);
  }
);

// Key Management APIs
export const keyApi = {
  // Get all keys
  getAllKeys: async (): Promise<AzureKey[]> => {
    const response = await api.get<ApiResponse<AzureKey[]>>('/api/keys');
    if (!response.data.success) {
      throw new Error(response.data.error || 'Failed to get keys');
    }
    return response.data.data || [];
  },

  // Get an available key
  getKey: async (region: string = 'eastasia', tag: string = ''): Promise<AzureKey> => {
    const response = await api.get<ApiResponse<AzureKey>>('/api/keys/get', {
      params: { region, tag }
    });
    if (!response.data.success) {
      throw new Error(response.data.error || 'Failed to get key');
    }
    return response.data.data!;
  },

  // Add a new key
  addKey: async (keyData: AddKeyForm): Promise<AzureKey> => {
    const response = await api.post<ApiResponse<AzureKey>>('/api/keys', keyData);
    if (!response.data.success) {
      throw new Error(response.data.error || 'Failed to add key');
    }
    return response.data.data!;
  },

  // Delete a key
  deleteKey: async (key: string): Promise<void> => {
    const response = await api.delete<ApiResponse>(`/api/keys/${encodeURIComponent(key)}`);
    if (!response.data.success) {
      throw new Error(response.data.error || 'Failed to delete key');
    }
  },

  // Disable a key
  disableKey: async (key: string): Promise<void> => {
    const response = await api.post<ApiResponse>(`/api/keys/${encodeURIComponent(key)}/disable`);
    if (!response.data.success) {
      throw new Error(response.data.error || 'Failed to disable key');
    }
  },

  // Enable a key
  enableKey: async (key: string): Promise<void> => {
    const response = await api.post<ApiResponse>(`/api/keys/${encodeURIComponent(key)}/enable`);
    if (!response.data.success) {
      throw new Error(response.data.error || 'Failed to enable key');
    }
  },

  // Update a key
  updateKey: async (key: string, keyname: string, region: string): Promise<AzureKey> => {
    const response = await api.put<ApiResponse<AzureKey>>(`/api/keys/${encodeURIComponent(key)}`, {
      keyname,
      region
    });
    if (!response.data.success) {
      throw new Error(response.data.error || 'Failed to update key');
    }
    return response.data.data!;
  },

  // Test a key
  testKey: async (keyData: TestKeyForm): Promise<TestKeyResult> => {
    const response = await api.post<ApiResponse<TestKeyResult>>('/api/keys/test', keyData);
    if (!response.data.success) {
      throw new Error(response.data.error || 'Failed to test key');
    }
    return response.data.data!;
  },

  // Set key status
  setKeyStatus: async (key: string, code: number, note: string = ''): Promise<void> => {
    const response = await api.post<ApiResponse>('/api/keys/status', {
      key,
      code,
      note
    });
    if (!response.data.success) {
      throw new Error(response.data.error || 'Failed to set key status');
    }
  },

  // Get key logs
  getKeyLogs: async (page: number = 1, limit: number = 50): Promise<LogsResponse> => {
    const response = await api.get<ApiResponse<LogsResponse>>('/api/keys/logs', {
      params: { page, limit }
    });
    if (!response.data.success) {
      throw new Error(response.data.error || 'Failed to get logs');
    }
    return response.data.data!;
  },

  // Get key statistics
  getKeyStats: async (): Promise<KeyStats> => {
    const response = await api.get<ApiResponse<KeyStats>>('/api/keys/stats');
    if (!response.data.success) {
      throw new Error(response.data.error || 'Failed to get stats');
    }
    return response.data.data!;
  }
};

// Configuration APIs
export const configApi = {
  // Get all configurations
  getAllConfigs: async (): Promise<SystemConfig[]> => {
    const response = await api.get<ApiResponse<SystemConfig[]>>('/api/config');
    if (!response.data.success) {
      throw new Error(response.data.error || 'Failed to get configurations');
    }
    return response.data.data || [];
  },

  // Get specific configuration
  getConfig: async (key: string): Promise<SystemConfig> => {
    const response = await api.get<ApiResponse<SystemConfig>>(`/api/config/${key}`);
    if (!response.data.success) {
      throw new Error(response.data.error || 'Failed to get configuration');
    }
    return response.data.data!;
  },

  // Create or update configuration
  saveConfig: async (config: SystemConfig): Promise<void> => {
    const response = await api.post<ApiResponse>('/api/config', config);
    if (!response.data.success) {
      throw new Error(response.data.error || 'Failed to save configuration');
    }
  },

  // Update specific configuration
  updateConfig: async (key: string, config_value: string, description?: string): Promise<void> => {
    const response = await api.put<ApiResponse>(`/api/config/${key}`, {
      config_value,
      description
    });
    if (!response.data.success) {
      throw new Error(response.data.error || 'Failed to update configuration');
    }
  },

  // Delete configuration
  deleteConfig: async (key: string): Promise<void> => {
    const response = await api.delete<ApiResponse>(`/api/config/${key}`);
    if (!response.data.success) {
      throw new Error(response.data.error || 'Failed to delete configuration');
    }
  },

  // Batch update configurations
  batchUpdateConfigs: async (configs: SystemConfig[]): Promise<void> => {
    const response = await api.post<ApiResponse>('/api/config/batch', { configs });
    if (!response.data.success) {
      throw new Error(response.data.error || 'Failed to batch update configurations');
    }
  }
};

// Translation Key APIs
export const translationApi = {
  // Get all translation keys
  getAllKeys: async (): Promise<TranslationKey[]> => {
    const response = await api.get<ApiResponse<TranslationKey[]>>('/api/translation/keys');
    if (!response.data.success) {
      throw new Error(response.data.error || 'Failed to get translation keys');
    }
    return response.data.data || [];
  },

  // Get available translation key
  getKey: async (region: string = 'eastasia', tag: string = ''): Promise<TranslationKey> => {
    const response = await api.get<ApiResponse<TranslationKey>>('/api/translation/keys/get', {
      params: { region, tag }
    });
    if (!response.data.success) {
      throw new Error(response.data.error || 'Failed to get translation key');
    }
    return response.data.data!;
  },

  // Add new translation key
  addKey: async (keyData: AddKeyForm): Promise<TranslationKey> => {
    const response = await api.post<ApiResponse<TranslationKey>>('/api/translation/keys', keyData);
    if (!response.data.success) {
      throw new Error(response.data.error || 'Failed to add translation key');
    }
    return response.data.data!;
  },

  // Delete translation key
  deleteKey: async (key: string): Promise<void> => {
    const response = await api.delete<ApiResponse>(`/api/translation/keys/${encodeURIComponent(key)}`);
    if (!response.data.success) {
      throw new Error(response.data.error || 'Failed to delete translation key');
    }
  },

  // Disable translation key
  disableKey: async (key: string): Promise<void> => {
    const response = await api.post<ApiResponse>(`/api/translation/keys/${encodeURIComponent(key)}/disable`);
    if (!response.data.success) {
      throw new Error(response.data.error || 'Failed to disable translation key');
    }
  },

  // Enable translation key
  enableKey: async (key: string): Promise<void> => {
    const response = await api.post<ApiResponse>(`/api/translation/keys/${encodeURIComponent(key)}/enable`);
    if (!response.data.success) {
      throw new Error(response.data.error || 'Failed to enable translation key');
    }
  },

  // Update translation key
  updateKey: async (key: string, keyname: string, region: string): Promise<TranslationKey> => {
    const response = await api.put<ApiResponse<TranslationKey>>(`/api/translation/keys/${encodeURIComponent(key)}`, {
      keyname,
      region
    });
    if (!response.data.success) {
      throw new Error(response.data.error || 'Failed to update translation key');
    }
    return response.data.data!;
  },

  // Test translation key
  testKey: async (keyData: TestKeyForm): Promise<TestKeyResult> => {
    const response = await api.post<ApiResponse<TestKeyResult>>('/api/translation/keys/test', keyData);
    if (!response.data.success) {
      throw new Error(response.data.error || 'Failed to test translation key');
    }
    return response.data.data!;
  },

  // Set translation key status
  setKeyStatus: async (key: string, code: number, note: string = ''): Promise<void> => {
    const response = await api.post<ApiResponse>('/api/translation/keys/status', {
      key,
      code,
      note
    });
    if (!response.data.success) {
      throw new Error(response.data.error || 'Failed to set translation key status');
    }
  },

  // Get translation key logs
  getKeyLogs: async (page: number = 1, limit: number = 50): Promise<LogsResponse> => {
    const response = await api.get<ApiResponse<LogsResponse>>('/api/translation/keys/logs', {
      params: { page, limit }
    });
    if (!response.data.success) {
      throw new Error(response.data.error || 'Failed to get translation logs');
    }
    return response.data.data!;
  },

  // Get translation key statistics
  getKeyStats: async (): Promise<KeyStats> => {
    const response = await api.get<ApiResponse<KeyStats>>('/api/translation/keys/stats');
    if (!response.data.success) {
      throw new Error(response.data.error || 'Failed to get translation stats');
    }
    return response.data.data!;
  }
};

// System APIs
export const systemApi = {
  // Health check
  healthCheck: async (): Promise<any> => {
    const response = await api.get<ApiResponse>('/api/health');
    return response.data;
  },

  // Get API documentation
  getApiDocs: async (): Promise<any> => {
    const response = await api.get('/api/docs');
    return response.data;
  }
};

// Upload APIs
export const uploadApi = {
  // 上传JSON文件批量创建key
  uploadKeys: async (file: File): Promise<any> => {
    const formData = new FormData();
    formData.append('file', file);
    
    const response = await api.post<ApiResponse>('/api/upload/keys', formData, {
      headers: {
        'Content-Type': 'multipart/form-data'
      }
    });
    
    if (!response.data.success) {
      throw new Error('Failed to upload keys');
    }
    return response.data.data;
  },

  // 实时创建语音/翻译资源key
  createResources: async (file: File): Promise<ResourceKeyCreationResponse> => {
    const formData = new FormData();
    formData.append('file', file);
    
    const response = await api.post<ResourceKeyCreationResponse>('/api/upload/create-resources', formData, {
      headers: {
        'Content-Type': 'multipart/form-data'
      }
    });
    
    if (!response.data.success) {
      throw new Error(response.data.message || 'Failed to create resources');
    }
    
    return response.data;
  },

  createResourcesWithCredentials: async (file: File, config: {
    resourceType: 'speech' | 'translation';
    subscriptionId: string;
    resourceGroupName: string;
    resourceName: string;
    location: string;
    sku: string;
    createResourceGroup: boolean;
    enableAfterCreate: boolean;
  }): Promise<ResourceKeyCreationResponse> => {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('resourceType', config.resourceType);
    formData.append('subscriptionId', config.subscriptionId);
    formData.append('resourceGroupName', config.resourceGroupName);
    formData.append('resourceName', config.resourceName);
    formData.append('location', config.location);
    formData.append('sku', config.sku);
    formData.append('createResourceGroup', config.createResourceGroup.toString());
    formData.append('enableAfterCreate', config.enableAfterCreate.toString());
    
    const response = await api.post<ResourceKeyCreationResponse>('/api/upload/create-resources', formData, {
      headers: {
        'Content-Type': 'multipart/form-data'
      }
    });
    
    if (!response.data.success) {
      throw new Error(response.data.message || 'Failed to create resources with credentials');
    }
    
    return response.data;
  },



  // 获取资源创建模板
  getResourceTemplate: async (type: 'speech' | 'translation' = 'speech'): Promise<any> => {
    const response = await api.get<ApiResponse>(`/api/upload/resource-template?type=${type}`);
    if (!response.data.success) {
      throw new Error('Failed to get resource template');
    }
    return response.data.data;
  },

  // 获取key上传模板
  getKeyTemplate: async (type: 'speech' | 'translation' = 'speech'): Promise<any> => {
    const response = await api.get<ApiResponse>(`/api/upload/template?type=${type}`);
    if (!response.data.success) {
      throw new Error('Failed to get key template');
    }
    return response.data.data;
  },

  // 批量操作key
  bulkOperation: async (operation: 'enable' | 'disable' | 'delete', keys: string[], type: 'speech' | 'translation'): Promise<any> => {
    const response = await api.post<ApiResponse>('/api/upload/bulk-operation', {
      operation,
      keys,
      type
    });
    
    if (!response.data.success) {
      throw new Error('Failed to perform bulk operation');
    }
    return response.data.data;
  }
};

// Scripts API
export const scriptsApi = {
  // Run cooldown recovery test
  runCooldownTest: async (type: 'speech' | 'translation' = 'speech'): Promise<any> => {
    const response = await api.post<ApiResponse>('/api/scripts/test-cooldown', { type }, {
      timeout: 90000 // 90秒超时，给脚本足够的执行时间
    });
    if (!response.data.success) {
      throw new Error(response.data.error || 'Failed to run cooldown test');
    }
    return response.data.data;
  },

  // 执行清理脚本
  runCleanup: async (): Promise<any> => {
    const response = await api.post<ApiResponse>('/api/scripts/cleanup', {}, {
      timeout: 90000 // 90秒超时，给脚本足够的执行时间
    });
    if (!response.data.success) {
      throw new Error(response.data.error || 'Failed to run cleanup script');
    }
    return response.data.data;
  },

  // 获取可用脚本列表
  getScriptsList: async (): Promise<any[]> => {
    const response = await api.get<ApiResponse>('/api/scripts/list');
    if (!response.data.success) {
      throw new Error(response.data.error || 'Failed to get scripts list');
    }
    return response.data.data;
  }
};

// Billing APIs
export const billingApi = {
  // Get billing usage
  getBillingUsage: async (subscriptionId: string, startDate?: string, endDate?: string): Promise<any> => {
    const response = await api.get<ApiResponse<any>>('/api/billing-azure/usage', {
      params: {
        subscriptionId,
        startDate,
        endDate
      }
    });
    if (!response.data.success) {
      throw new Error(response.data.error || 'Failed to get billing usage');
    }
    return response.data.data;
  },

  // Get account balance
  getAccountBalance: async (subscriptionId: string): Promise<any> => {
    const response = await api.get<ApiResponse<any>>('/api/billing-azure/balance', {
      params: { subscriptionId }
    });
    if (!response.data.success) {
      throw new Error(response.data.error || 'Failed to get account balance');
    }
    return response.data.data;
  },

  // Get usage statistics
  getUsageStatistics: async (subscriptionId: string): Promise<any> => {
    const response = await api.get<ApiResponse<any>>('/api/billing-azure/statistics', {
      params: { subscriptionId }
    });
    if (!response.data.success) {
      throw new Error(response.data.error || 'Failed to get usage statistics');
    }
    return response.data.data;
  },

  // Get cognitive services billing
  getCognitiveServicesBilling: async (subscriptionId: string): Promise<any> => {
    const response = await api.get<ApiResponse<any>>('/api/billing-azure/cognitive-services', {
      params: { subscriptionId }
    });
    if (!response.data.success) {
      throw new Error(response.data.error || 'Failed to get cognitive services billing');
    }
    return response.data.data;
  }
};

// Feishu Notification APIs
export const notificationApi = {
  // Get Feishu notification status
  getFeishuStatus: async (): Promise<any> => {
    const response = await api.get<ApiResponse<any>>('/api/notification/feishu/status');
    if (!response.data.success) {
      throw new Error(response.data.error || 'Failed to get Feishu status');
    }
    return response.data.data;
  },

  // Send test Feishu notification
  sendTestNotification: async (): Promise<any> => {
    const response = await api.post<ApiResponse<any>>('/api/notification/feishu/test');
    if (!response.data.success) {
      throw new Error(response.data.error || 'Failed to send test notification');
    }
    return response.data.data;
  },

  // Send custom Feishu notification
  sendNotification: async (title: string, content: string): Promise<any> => {
    const response = await api.post<ApiResponse<any>>('/api/notification/feishu/send', {
      title,
      content
    });
    if (!response.data.success) {
      throw new Error(response.data.error || 'Failed to send notification');
    }
    return response.data.data;
  },

  // Send 401 error alert for a key
  send401Alert: async (keyId: string, keyName: string, service: 'speech' | 'translation', region: string): Promise<any> => {
    const timestamp = new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' });
    const title = '🚨 Azure密钥401错误警报';
    const content = `密钥ID: ${keyId}\n密钥名称: ${keyName}\n服务类型: ${service}\n区域: ${region}\n错误时间: ${timestamp}\n\n该密钥已被自动禁用，请检查密钥状态并及时更换。`;
    
    return await notificationApi.sendNotification(title, content);
  }
};

export default api;
