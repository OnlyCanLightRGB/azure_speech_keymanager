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
