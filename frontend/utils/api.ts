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
  TestKeyForm
} from '../types';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL;

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
    console.log(`API Request: ${config.method?.toUpperCase()} ${config.url}`);
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
    console.error('API Response Error:', error.response?.data || error.message);
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

export default api;
