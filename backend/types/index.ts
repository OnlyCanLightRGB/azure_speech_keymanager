export interface AzureKey {
  id?: number;
  key: string;
  region: string;
  keyname: string;
  status: KeyStatus;
  created_at?: Date;
  updated_at?: Date;
  last_used?: Date;
  usage_count?: number;
  error_count?: number;
}

export enum KeyStatus {
  ENABLED = 'enabled',
  DISABLED = 'disabled',
  COOLDOWN = 'cooldown'
}

export interface KeyLog {
  id?: number;
  key_id: number;
  action: LogAction;
  status_code?: number;
  note?: string;
  created_at?: Date;
  ip_address?: string;
  user_agent?: string;
}

export enum LogAction {
  GET_KEY = 'get_key',
  SET_STATUS = 'set_status',
  ADD_KEY = 'add_key',
  DELETE_KEY = 'delete_key',
  DISABLE_KEY = 'disable_key',
  ENABLE_KEY = 'enable_key',
  TEST_KEY = 'test_key',
  COOLDOWN_START = 'cooldown_start',
  COOLDOWN_END = 'cooldown_end'
}

export interface CooldownKey {
  key: string;
  cooldownUntil: number; // timestamp
}

export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  message?: string;
  error?: string;
}

export interface GetKeyRequest {
  region?: string;
  tag?: string;
}

export interface SetKeyStatusRequest {
  key: string;
  code: number;
  note?: string;
}

export interface AddKeyRequest {
  key: string;
  region: string;
  keyname?: string;
}

export interface TestKeyRequest {
  key: string;
  region: string;
}

export interface SystemConfig {
  id?: number;
  config_key: string;
  config_value: string;
  description?: string;
  updated_at?: Date;
}

export interface DatabaseConfig {
  host: string;
  port: number;
  user: string;
  password: string;
  database: string;
}

export interface AzureTTSRequest {
  text: string;
  voice?: string;
  outputFormat?: string;
}

export interface AzureTTSResponse {
  success: boolean;
  audioData?: Buffer;
  error?: string;
  statusCode?: number;
}

export interface AzureSTTRequest {
  audioData: Buffer;
  language?: string;
  format?: string;
}

export interface AzureSTTResponse {
  success: boolean;
  transcription?: string;
  recognitionStatus?: string;
  error?: string;
  statusCode?: number;
  rawResponse?: any;
}

// 翻译资源相关类型
export interface TranslationKey {
  id?: number;
  key: string;
  region: string;
  keyname: string;
  status: KeyStatus;
  created_at?: Date;
  updated_at?: Date;
  last_used?: Date;
  usage_count?: number;
  error_count?: number;
}

export interface TranslationRequest {
  text: string;
  from?: string;
  to: string;
  apiVersion?: string;
}

export interface TranslationResponse {
  success: boolean;
  translatedText?: string;
  detectedLanguage?: string;
  error?: string;
  statusCode?: number;
  rawResponse?: any;
}

export interface TranslationTestRequest {
  key: string;
  region: string;
  text?: string;
  from?: string;
  to?: string;
}

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

export interface SpeechTranslationTestRequest {
  key: string;
  region: string;
  audioData: Buffer;
  from?: string;
  to?: string;
  voice?: string;
}

// 文件上传和批量key管理相关类型
export interface KeyUploadRequest {
  keys: KeyUploadItem[];
  type: 'speech' | 'translation';
  overwrite?: boolean;
}

export interface KeyUploadItem {
  key: string;
  region: string;
  keyname?: string;
  status?: KeyStatus;
}

export interface KeyUploadResponse {
  success: boolean;
  data: {
    total: number;
    success: number;
    failed: number;
    results: KeyUploadResult[];
  };
  message: string;
}

export interface KeyUploadResult {
  key: string;
  success: boolean;
  message: string;
  error?: string;
}

export interface BulkKeyOperationRequest {
  operation: 'enable' | 'disable' | 'delete';
  keys: string[];
  type: 'speech' | 'translation';
}

export interface BulkKeyOperationResponse {
  success: boolean;
  data: {
    total: number;
    success: number;
    failed: number;
    results: BulkKeyOperationResult[];
  };
  message: string;
}

export interface BulkKeyOperationResult {
  key: string;
  success: boolean;
  message: string;
  error?: string;
}

// 实时创建资源key相关类型
export interface ResourceKeyCreationRequest {
  type: 'speech' | 'translation';
  keys: ResourceKeyItem[];
  options?: ResourceCreationOptions;
}

export interface ResourceKeyItem {
  key: string;
  region: string;
  keyname?: string;
  status?: KeyStatus;
  endpoint?: string;
  apiVersion?: string;
  features?: string[];
}

export interface ResourceCreationOptions {
  overwrite?: boolean;
  validateBeforeCreate?: boolean;
  enableAfterCreate?: boolean;
  setDefaultRegion?: boolean;
}

export interface ResourceKeyCreationResponse {
  success: boolean;
  data: {
    total: number;
    success: number;
    failed: number;
    results: ResourceKeyCreationResult[];
    createdKeys: (AzureKey | TranslationKey)[];
  };
  message: string;
}

export interface ResourceKeyCreationResult {
  key: string;
  success: boolean;
  message: string;
  error?: string;
  resourceId?: string;
  endpoint?: string;
}



// 账单监控相关类型
export interface BillingMonitoringRequest {
  subscriptionId: string;
  keys: BillingKeyItem[];
  options?: BillingMonitoringOptions;
}

export interface BillingKeyItem {
  key: string;
  region: string;
  keyname: string;
  type: 'speech' | 'translation';
  resourceId?: string;
}

export interface BillingMonitoringOptions {
  interval?: number; // 监控间隔（分钟），默认10分钟
  threshold?: number; // 费用告警阈值
  enableAlerts?: boolean; // 是否启用告警
  autoReport?: boolean; // 是否自动生成报告
}

export interface BillingMonitoringResponse {
  success: boolean;
  data: {
    taskId: string;
    subscriptionId: string;
    monitoredKeys: number;
    interval: number;
    startTime: string;
  };
  message: string;
}

export interface KeyBillingInfo {
  key: string;
  keyname: string;
  type: 'speech' | 'translation';
  region: string;
  resourceId?: string;
  cost: number;
  currency: string;
  usage: {
    requests: number;
    characters?: number;
    audioMinutes?: number;
  };
  lastUpdated: string;
}

export interface BillingReport {
  subscriptionId: string;
  reportId: string;
  generatedAt: string;
  period: {
    startDate: string;
    endDate: string;
  };
  summary: {
    totalCost: number;
    currency: string;
    speechCost: number;
    translationCost: number;
    totalKeys: number;
  };
  keyDetails: KeyBillingInfo[];
  anomalies: BillingAnomaly[];
}

export interface BillingAnomaly {
  type: 'high_cost' | 'unusual_usage' | 'quota_exceeded';
  key: string;
  keyname: string;
  description: string;
  cost: number;
  threshold: number;
  severity: 'low' | 'medium' | 'high';
  detectedAt: string;
}

export interface BillingAlert {
  id: string;
  type: 'cost_threshold' | 'usage_spike' | 'quota_warning';
  key: string;
  keyname: string;
  message: string;
  severity: 'info' | 'warning' | 'error';
  cost?: number;
  threshold?: number;
  createdAt: string;
  acknowledged: boolean;
}

// Azure服务主体凭据接口
export interface AzureServicePrincipal {
  appId: string;
  displayName: string;
  password: string;
  tenant: string;
}

// Azure资源创建请求（基于服务主体凭据）
export interface AzureResourceCreationRequest {
  credentials: AzureServicePrincipal;
  resourceType: 'speech' | 'translation';
  resourceConfig: {
    subscriptionId?: string;
    resourceGroupName?: string;
    resourceName?: string;
    location?: string;
    sku?: string;
  };
  options?: {
    createResourceGroup?: boolean;
    enableAfterCreate?: boolean;
    addToKeyManager?: boolean;
  };
}

// Azure资源创建响应
export interface AzureResourceCreationResponse {
  success: boolean;
  data?: {
    resourceId: string;
    resourceName: string;
    resourceGroup: string;
    location: string;
    keys: {
      key1: string;
      key2: string;
    };
    endpoint: string;
    subscriptionId: string;
  };
  message: string;
  error?: string;
}
