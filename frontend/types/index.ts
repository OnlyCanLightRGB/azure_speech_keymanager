export interface AzureKey {
  id?: number;
  key: string;
  region: string;
  keyname: string;
  status: KeyStatus;
  created_at?: string;
  updated_at?: string;
  last_used?: string;
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
  created_at?: string;
  ip_address?: string;
  user_agent?: string;
  keyname?: string;
  region?: string;
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

export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  message?: string;
  error?: string;
}

export interface SystemConfig {
  id?: number;
  config_key: string;
  config_value: string;
  description?: string;
  updated_at?: string;
}

export interface CooldownKey {
  key: string;
  cooldownUntil: number;
}

export interface KeyStats {
  cooldown: {
    totalCooldownKeys: number;
    activeKeys: string[];
  };
  cooldownKeys: CooldownKey[];
}

export interface LogsResponse {
  logs: KeyLog[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface TestKeyResult {
  statusCode: number;
  audioSize: number;
  error?: string;
}

export interface AddKeyForm {
  key: string;
  region: string;
  keyname: string;
}

export interface TestKeyForm {
  key: string;
  region: string;
}

export interface EditKeyForm {
  keyname: string;
  region: string;
}

export interface ConfigForm {
  config_key: string;
  config_value: string;
  description: string;
}

// UI Component Props
export interface KeyTableProps {
  keys: AzureKey[];
  loading: boolean;
  onEdit: (key: AzureKey) => void;
  onDelete: (key: string) => void;
  onDisable: (key: string) => void;
  onEnable: (key: string) => void;
  onTest: (key: string, region: string) => void;
  onRefresh: () => void;
}

export interface LogTableProps {
  logs: KeyLog[];
  loading: boolean;
  pagination: {
    current: number;
    pageSize: number;
    total: number;
    onChange: (page: number, pageSize: number) => void;
  };
}

export interface ConfigTableProps {
  configs: SystemConfig[];
  loading: boolean;
  onEdit: (config: SystemConfig) => void;
  onDelete: (key: string) => void;
  onRefresh: () => void;
}

export interface StatsCardProps {
  title: string;
  value: number | string;
  icon?: React.ReactNode;
  color?: string;
}

// Form validation rules
export const REGIONS = [
  'eastasia',
  'southeastasia',
  'westus',
  'westus2',
  'eastus',
  'eastus2',
  'westeurope',
  'northeurope',
  'japaneast',
  'japanwest',
  'australiaeast',
  'centralindia',
  'uksouth',
  'francecentral',
  'koreacentral',
  'canadacentral',
  'brazilsouth'
];

export const STATUS_COLORS = {
  [KeyStatus.ENABLED]: 'green',
  [KeyStatus.DISABLED]: 'red',
  [KeyStatus.COOLDOWN]: 'orange'
};

export const ACTION_COLORS = {
  [LogAction.GET_KEY]: 'blue',
  [LogAction.SET_STATUS]: 'orange',
  [LogAction.ADD_KEY]: 'green',
  [LogAction.DELETE_KEY]: 'red',
  [LogAction.DISABLE_KEY]: 'red',
  [LogAction.ENABLE_KEY]: 'green',
  [LogAction.TEST_KEY]: 'purple',
  [LogAction.COOLDOWN_START]: 'orange',
  [LogAction.COOLDOWN_END]: 'green'
};
