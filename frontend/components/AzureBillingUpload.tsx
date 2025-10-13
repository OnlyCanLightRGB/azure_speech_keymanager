import React, { useState, useEffect, useCallback } from 'react';
import {
  Box,
  Button,
  Card,
  CardContent,
  Typography,
  Alert,
  CircularProgress,
  Divider,
  Chip,
  Paper,
  List,
  ListItem,
  ListItemText,
  ListItemIcon,
  Collapse,
  IconButton,
  Tabs,
  Tab,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Pagination,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  FormControlLabel,
  Switch,
  MenuItem,
  Select,
  FormControl,
  InputLabel
} from '@mui/material';
import { styled } from '@mui/material/styles';
import {
  CloudUpload,
  ExpandMore,
  ExpandLess,
  AccountBalance,
  Receipt,
  TrendingUp,
  History,
  Refresh,
  FilterList,
  Schedule,
  Add,
  Edit,
  Delete,
  PlayArrow,
  Assessment,
  Visibility,
  KeyboardArrowDown,
  KeyboardArrowUp
} from '@mui/icons-material';

const VisuallyHiddenInput = styled('input')({
  clip: 'rect(0 0 0 0)',
  clipPath: 'inset(50%)',
  height: 1,
  overflow: 'hidden',
  position: 'absolute',
  bottom: 0,
  left: 0,
  whiteSpace: 'nowrap',
  width: 1,
});

interface BillingResult {
  success: boolean;
  message: string;
  credentials_info?: {
    appId: string;
    displayName: string;
    tenant: string;
  };
  result?: {
    success: boolean;
    output: string;
    data: any;
    message?: string;
  };
}

interface CredentialsExample {
  success: boolean;
  example: {
    appId: string;
    displayName: string;
    password: string;
    tenant: string;
  };
  instructions: string[];
}

interface JsonBillingHistoryRecord {
  id: number;
  fileName: string;
  filePath: string;
  appId: string;
  tenantId: string;
  displayName: string;
  queryDate: string;
  subscriptionId?: string;
  totalCost?: number;
  currency?: string;
  billingData?: any;
  queryStatus: 'success' | 'failed' | 'no_subscription';
  errorMessage?: string;
  lastModified: string;
  createdAt: string;
  updatedAt: string;
}

interface JsonBillingHistoryResponse {
  success: boolean;
  data?: {
    history: JsonBillingHistoryRecord[];
    totalCount: number;
    filters: {
      fileName: string | null;
      startDate: Date | null;
      endDate: Date | null;
      limit: number;
    };
  };
  error?: string;
  message?: string;
}

// 新增JSON配置相关接口
interface JsonBillingConfig {
  id?: number;
  configName: string;
  fileName: string;
  filePath: string;
  appId: string;
  tenantId: string;
  displayName: string;
  password: string;
  autoQueryEnabled: boolean;
  queryIntervalMinutes: number;
  lastQueryTime?: string;
  nextQueryTime?: string;
  status: 'active' | 'inactive' | 'error';
  errorMessage?: string;
  createdAt?: string;
  updatedAt?: string;
  // 前端扩展字段，用于存储历史记录
  history?: JsonBillingHistoryRecord[];
  historyCount?: number;
}

interface JsonBillingConfigResponse {
  success: boolean;
  data?: {
    configs: JsonBillingConfig[];
    totalCount: number;
  };
  error?: string;
  message?: string;
}

const AzureBillingUpload: React.FC = () => {
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<BillingResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showExample, setShowExample] = useState(false);
  const [example, setExample] = useState<CredentialsExample | null>(null);
  const [showDetails, setShowDetails] = useState(false);

  // 历史记录相关状态
  const [tabValue, setTabValue] = useState(0);
  const [historyData, setHistoryData] = useState<JsonBillingHistoryRecord[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [totalCount, setTotalCount] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize] = useState(10);

  // 筛选条件
  const [filterFileName, setFilterFileName] = useState('');
  const [filterStartDate, setFilterStartDate] = useState('');
  const [filterEndDate, setFilterEndDate] = useState('');

  // JSON配置管理相关状态
  const [jsonConfigs, setJsonConfigs] = useState<JsonBillingConfig[]>([]);
  const [configsLoading, setConfigsLoading] = useState(false);
  const [configsError, setConfigsError] = useState<string | null>(null);

  // 添加调试日志
  useEffect(() => {
    console.log('📊 JSON配置状态更新:', jsonConfigs.length, '个配置', jsonConfigs);
  }, [jsonConfigs]);
  const [configDialogOpen, setConfigDialogOpen] = useState(false);

  // 添加对话框状态监听
  useEffect(() => {
    console.log('📊 配置对话框状态变化:', configDialogOpen);
  }, [configDialogOpen]);
  const [editingConfig, setEditingConfig] = useState<JsonBillingConfig | null>(null);

  // 配置历史记录展开状态
  const [expandedConfigs, setExpandedConfigs] = useState<Set<number>>(new Set());
  const [configHistories, setConfigHistories] = useState<Map<number, JsonBillingHistoryRecord[]>>(new Map());
  const [configHistoryLoading, setConfigHistoryLoading] = useState<Set<number>>(new Set());
  const [configForm, setConfigForm] = useState<Partial<JsonBillingConfig>>({
    configName: '',
    fileName: '',
    filePath: '',
    appId: '',
    tenantId: '',
    displayName: '',
    password: '',
    autoQueryEnabled: false,
    queryIntervalMinutes: 60,
    status: 'active'
  });

  // JSON文件上传相关状态
  const [uploadedFileName, setUploadedFileName] = useState<string>('');
  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = event.target.files?.[0];
    if (selectedFile) {
      if (selectedFile.type === 'application/json' || selectedFile.name.endsWith('.json')) {
        setFile(selectedFile);
        setError(null);
        setResult(null);
      } else {
        setError('请选择JSON格式的文件');
        setFile(null);
      }
    }
  };

  const handleUpload = async () => {
    if (!file) {
      setError('请先选择文件');
      return;
    }

    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const formData = new FormData();
      formData.append('credentials', file);

      const response = await fetch('/api/billing-azure/upload-credentials', {
        method: 'POST',
        body: formData,
      });

      // 首先检查响应的内容类型
      const contentType = response.headers.get('content-type');
      if (!contentType || !contentType.includes('application/json')) {
        const text = await response.text();
        throw new Error(`服务器返回非JSON响应: ${text.substring(0, 100)}...`);
      }

      const data = await response.json();

      if (response.ok) {
        setResult(data);
      } else {
        setError(data.error || '上传失败');
      }
    } catch (err: any) {
      setError('网络错误: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  const fetchExample = async () => {
    try {
      const response = await fetch('/api/billing-azure/example-credentials');
      const data = await response.json();
      if (response.ok) {
        setExample(data);
        setShowExample(true);
      }
    } catch (err: any) {
      console.error('获取示例失败:', err);
    }
  };

  // 获取历史记录
  const fetchHistory = async () => {
    setHistoryLoading(true);
    setHistoryError(null);

    try {
      const params = new URLSearchParams();
      if (filterFileName) params.append('fileName', filterFileName);
      if (filterStartDate) params.append('startDate', filterStartDate);
      if (filterEndDate) params.append('endDate', filterEndDate);
      params.append('limit', (currentPage * pageSize).toString());

      const response = await fetch(`/api/billing-azure/json-history?${params.toString()}`);
      const data: JsonBillingHistoryResponse = await response.json();

      if (response.ok && data.success && data.data) {
        setHistoryData(data.data.history);
        setTotalCount(data.data.totalCount);
      } else {
        setHistoryError(data.error || data.message || '获取历史记录失败');
      }
    } catch (err: any) {
      setHistoryError('网络错误: ' + err.message);
    } finally {
      setHistoryLoading(false);
    }
  };

  // 处理标签页切换
  const handleTabChange = (_event: React.SyntheticEvent, newValue: number) => {
    setTabValue(newValue);
    if (newValue === 1 && historyData.length === 0) {
      fetchHistory();
    }
    if (newValue === 2 && jsonConfigs.length === 0) {
      fetchJsonConfigs();
    }
  };

  // JSON配置管理相关函数
  // JSON文件上传处理函数
  const handleJsonFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = event.target.files?.[0];
    if (!selectedFile) return;

    // 重置错误状态
    setConfigsError(null);

    // 文件类型验证
    if (!selectedFile.type.includes('json') && !selectedFile.name.endsWith('.json')) {
      setConfigsError('请选择JSON格式的文件');
      return;
    }

    // 文件大小验证 (1MB)
    if (selectedFile.size > 1024 * 1024) {
      setConfigsError('文件大小不能超过1MB');
      return;
    }

    try {
      // 读取文件内容
      const fileContent = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (e) => resolve(e.target?.result as string);
        reader.onerror = () => reject(new Error('文件读取失败'));
        reader.readAsText(selectedFile);
      });

      // 解析JSON内容
      let jsonData;
      try {
        jsonData = JSON.parse(fileContent);
      } catch (parseError) {
        setConfigsError('JSON文件格式错误，请检查文件内容');
        return;
      }

      // 验证必要字段
      const requiredFields = ['appId', 'tenant', 'displayName', 'password'];
      const missingFields = requiredFields.filter(field => !jsonData[field] || jsonData[field].toString().trim() === '');

      if (missingFields.length > 0) {
        setConfigsError(`JSON文件缺少必要字段：${missingFields.join(', ')}`);
        return;
      }

      // 验证字段格式
      if (typeof jsonData.appId !== 'string' || jsonData.appId.length < 10) {
        setConfigsError('appId格式不正确，应为有效的应用程序ID');
        return;
      }

      if (typeof jsonData.tenant !== 'string' || jsonData.tenant.length < 10) {
        setConfigsError('tenant格式不正确，应为有效的租户ID');
        return;
      }

      // 上传文件到服务器
      const formData = new FormData();
      formData.append('jsonFile', selectedFile);

      const uploadResponse = await fetch('/api/billing-azure/upload-json-config', {
        method: 'POST',
        body: formData,
      });

      const uploadResult = await uploadResponse.json();

      if (uploadResponse.ok && uploadResult.success) {
        // 自动填充表单
        setConfigForm({
          ...configForm,
          configName: selectedFile.name.replace('.json', ''),
          fileName: uploadResult.fileName,
          filePath: uploadResult.filePath,
          appId: jsonData.appId,
          tenantId: jsonData.tenant,
          displayName: jsonData.displayName,
          password: jsonData.password,
        });

        setUploadedFileName(selectedFile.name);
        setConfigsError(null);
      } else {
        setConfigsError(uploadResult.error || '文件上传失败');
      }
    } catch (err: any) {
      console.error('文件处理失败:', err);
      setConfigsError('文件处理失败: ' + err.message);
    }
  };

  const fetchJsonConfigs = async () => {
    // 防止重复调用
    if (configsLoading) {
      return;
    }

    console.log('🔄 开始获取JSON配置...');
    setConfigsLoading(true);
    setConfigsError(null);

    try {
      const response = await fetch('/api/billing-azure/json-configs');
      const data: JsonBillingConfigResponse = await response.json();

      console.log('📊 API响应:', data);

      if (response.ok && data.success && data.data) {
        console.log(`✅ 获取到 ${data.data.configs.length} 个配置`);
        // 为每个配置获取历史记录
        const configsWithHistory = await Promise.all(
          data.data.configs.map(async (config) => {
            if (config.id) {
              try {
                // 获取该配置的历史记录
                const historyResponse = await fetch(`/api/billing-azure/json-history?fileName=${encodeURIComponent(config.fileName)}&limit=10`);
                const historyData = await historyResponse.json();

                if (historyResponse.ok && historyData.success && historyData.data) {
                  return {
                    ...config,
                    history: historyData.data.history || [],
                    historyCount: historyData.data.totalCount || 0
                  };
                }
              } catch (error) {
                console.error(`Failed to fetch history for config ${config.id}:`, error);
              }
            }

            return {
              ...config,
              history: [],
              historyCount: 0
            };
          })
        );

        console.log('🎯 设置配置数据:', configsWithHistory);
        setJsonConfigs(configsWithHistory);
      } else {
        console.error('❌ API响应错误:', data);
        setConfigsError(data.error || data.message || '获取JSON配置失败');
      }
    } catch (err: any) {
      console.error('❌ 网络错误:', err);
      setConfigsError('网络错误: ' + err.message);
    } finally {
      setConfigsLoading(false);
    }
  };

  const saveJsonConfig = async () => {
    try {
      const url = editingConfig
        ? `/api/billing-azure/json-configs/${editingConfig.id}`
        : '/api/billing-azure/json-configs';

      const method = editingConfig ? 'PUT' : 'POST';

      const response = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(configForm),
      });

      const data = await response.json();

      if (response.ok && data.success) {
        setConfigDialogOpen(false);
        setEditingConfig(null);
        resetConfigForm();
        fetchJsonConfigs();
      } else {
        setConfigsError(data.error || data.message || '保存配置失败');
      }
    } catch (err: any) {
      setConfigsError('网络错误: ' + err.message);
    }
  };

  const deleteJsonConfig = async (configId: number) => {
    if (!confirm('确定要删除这个配置吗？')) return;

    try {
      const response = await fetch(`/api/billing-azure/json-configs/${configId}`, {
        method: 'DELETE',
      });

      const data = await response.json();

      if (response.ok && data.success) {
        fetchJsonConfigs();
      } else {
        setConfigsError(data.error || data.message || '删除配置失败');
      }
    } catch (err: any) {
      setConfigsError('网络错误: ' + err.message);
    }
  };

  const executeJsonConfig = async (configId: number) => {
    try {
      const response = await fetch(`/api/billing-azure/json-configs/${configId}/execute`, {
        method: 'POST',
      });

      const data = await response.json();

      if (response.ok && data.success) {
        alert('配置执行成功！');
        fetchJsonConfigs();
      } else {
        setConfigsError(data.error || data.message || '执行配置失败');
      }
    } catch (err: any) {
      setConfigsError('网络错误: ' + err.message);
    }
  };

  // 获取特定配置的历史记录
  const fetchConfigHistory = async (configId: number) => {
    setConfigHistoryLoading(prev => new Set(prev).add(configId));

    try {
      // 先找到对应的配置以获取fileName
      const config = jsonConfigs.find(c => c.id === configId);
      if (!config) {
        console.error('找不到配置ID:', configId);
        return;
      }

      const response = await fetch(`/api/billing-azure/json-history?fileName=${encodeURIComponent(config.fileName)}&limit=5`);
      const data = await response.json();

      if (response.ok && data.success) {
        setConfigHistories(prev => new Map(prev).set(configId, data.data.history || []));
      } else {
        console.error('获取配置历史失败:', data.error || data.message);
      }
    } catch (err: any) {
      console.error('网络错误:', err.message);
    } finally {
      setConfigHistoryLoading(prev => {
        const newSet = new Set(prev);
        newSet.delete(configId);
        return newSet;
      });
    }
  };

  // 切换配置历史记录展开状态
  const toggleConfigHistory = async (configId: number) => {
    const isExpanded = expandedConfigs.has(configId);

    if (isExpanded) {
      // 收起
      setExpandedConfigs(prev => {
        const newSet = new Set(prev);
        newSet.delete(configId);
        return newSet;
      });
    } else {
      // 展开并获取历史记录
      setExpandedConfigs(prev => new Set(prev).add(configId));
      if (!configHistories.has(configId)) {
        await fetchConfigHistory(configId);
      }
    }
  };

  // 添加缺失的函数
  const executeConfig = executeJsonConfig; // 别名
  const deleteConfig = deleteJsonConfig; // 别名

  const triggerAllQueries = async () => {
    try {
      const response = await fetch('/api/billing-azure/trigger-json-query', {
        method: 'POST',
      });

      const data = await response.json();
      if (response.ok && data.success) {
        alert('所有查询已开始执行');
        await fetchJsonConfigs(); // 刷新配置列表
      } else {
        setConfigsError(data.error || data.message || '执行失败');
      }
    } catch (err: any) {
      setConfigsError('网络错误: ' + err.message);
    }
  };

  const openConfigDialog = (config?: JsonBillingConfig) => {
    console.log('🔧 打开配置对话框:', config ? '编辑模式' : '添加模式');
    console.log('🔧 当前configDialogOpen状态:', configDialogOpen);
    console.log('🔧 函数被调用，参数:', config);

    if (config) {
      setEditingConfig(config);
      setConfigForm({
        configName: config.configName,
        fileName: config.fileName,
        filePath: config.filePath,
        appId: config.appId,
        tenantId: config.tenantId,
        displayName: config.displayName,
        password: config.password,
        autoQueryEnabled: config.autoQueryEnabled,
        queryIntervalMinutes: config.queryIntervalMinutes,
        status: config.status
      });
    } else {
      setEditingConfig(null);
      resetConfigForm();
    }
    console.log('📝 设置对话框状态为打开');
    setConfigDialogOpen(true);
    console.log('📝 对话框状态已设置为true');
  };

  const resetConfigForm = () => {
    setConfigForm({
      configName: '',
      fileName: '',
      filePath: '',
      appId: '',
      tenantId: '',
      displayName: '',
      password: '',
      autoQueryEnabled: false,
      queryIntervalMinutes: 60,
      status: 'active'
    });
    // 重置上传状态
    setUploadedFileName('');
  };

  // 处理分页
  const handlePageChange = (_event: React.ChangeEvent<unknown>, page: number) => {
    setCurrentPage(page);
  };

  // 重置筛选条件
  const resetFilters = () => {
    setFilterFileName('');
    setFilterStartDate('');
    setFilterEndDate('');
    setCurrentPage(1);
  };

  // 应用筛选条件
  const applyFilters = () => {
    setCurrentPage(1);
    fetchHistory();
  };

  // 格式化日期字符串
  const formatDateString = (dateString: string) => {
    return new Date(dateString).toLocaleString('zh-CN');
  };

  const getStatusChip = (status: string) => {
    switch (status) {
      case 'success':
        return <Chip label="成功" color="success" size="small" />;
      case 'failed':
        return <Chip label="失败" color="error" size="small" />;
      case 'no_subscription':
        return <Chip label="无订阅" color="warning" size="small" />;
      case 'active':
        return <Chip label="活跃" color="success" size="small" />;
      case 'inactive':
        return <Chip label="停用" color="default" size="small" />;
      case 'error':
        return <Chip label="错误" color="error" size="small" />;
      default:
        return <Chip label="未知" color="default" size="small" />;
    }
  };

  // 使用useCallback稳定函数引用
  const stableFetchHistory = useCallback(async () => {
    await fetchHistory();
  }, [filterFileName, filterStartDate, filterEndDate, currentPage, pageSize]);

  const stableFetchJsonConfigs = useCallback(async () => {
    await fetchJsonConfigs();
  }, []);

  // 当筛选条件或分页改变时重新获取数据
  useEffect(() => {
    let isMounted = true; // 防止组件卸载后的状态更新
    let timeoutId: NodeJS.Timeout;

    const loadData = async () => {
      try {
        if (tabValue === 0 && isMounted) {
          // 定时配置管理标签页 - 延迟加载避免与用户交互冲突
          timeoutId = setTimeout(async () => {
            if (isMounted) {
              await stableFetchJsonConfigs();
            }
          }, 100);
        } else if (tabValue === 1 && isMounted) {
          await stableFetchHistory();
        } else if (tabValue === 2 && isMounted) {
          await stableFetchJsonConfigs(); // 当切换到手动查询标签页时加载配置
        }
      } catch (error) {
        if (isMounted) {
          console.error('Failed to load data:', error);
        }
      }
    };

    loadData();

    // 清理函数
    return () => {
      isMounted = false;
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
    };
  }, [tabValue, stableFetchHistory, stableFetchJsonConfigs]);

  // 初始化加载数据
  useEffect(() => {
    let isMounted = true;

    const initializeData = async () => {
      try {
        console.log('🚀 初始化数据加载...');
        if (isMounted) {
          await Promise.all([fetchHistory(), stableFetchJsonConfigs()]);
          console.log('✅ 初始化数据加载完成');
        }
      } catch (error) {
        if (isMounted) {
          console.error('❌ 初始化数据失败:', error);
        }
      }
    };

    initializeData();

    // 清理函数
    return () => {
      isMounted = false;
    };
  }, [stableFetchJsonConfigs]);



  const parseResourceId = (resourceId: string) => {
    const parts = resourceId.split('/');
    const resourceGroupIndex = parts.findIndex(part => part === 'resourcegroups');
    const resourceGroup = resourceGroupIndex !== -1 ? parts[resourceGroupIndex + 1] : 'N/A';
    const resourceName = parts[parts.length - 1] || 'N/A';
    return { resourceGroup, resourceName };
  };

  const formatDate = (dateNumber: number) => {
    const dateStr = dateNumber.toString();
    if (dateStr.length === 8) {
      const year = dateStr.substring(0, 4);
      const month = dateStr.substring(4, 6);
      const day = dateStr.substring(6, 8);
      return `${year}年${month}月${day}日`;
    }
    return dateStr;
  };

  const renderBillingData = (data: any) => {
    if (!data) return null;

    // 计算汇总数据
    let totalCost = 0;
    const subscriptions = Object.keys(data);
    const resourceNames = new Set<string>();
    const serviceDetails: any[] = [];

    subscriptions.forEach(subscriptionId => {
      const subscription = data[subscriptionId];
      if (subscription.cost_data?.properties?.rows) {
        subscription.cost_data.properties.rows.forEach((row: any[]) => {
          const [cost, usage, date, resourceId, meter, currency] = row;
          totalCost += cost;
          const { resourceGroup, resourceName } = parseResourceId(resourceId);
          resourceNames.add(resourceName);
          serviceDetails.push({
            subscriptionName: subscription.subscription_name,
            cost,
            usage,
            date: formatDate(date),
            resourceName,
            resourceGroup,
            meter,
            currency
          });
        });
      }
    });

    const avgDailyCost = serviceDetails.length > 0 ? totalCost / new Set(serviceDetails.map(s => s.date)).size : 0;

    return (
      <Paper elevation={2} sx={{ p: 2, mt: 2 }}>
        <Typography variant="h6" gutterBottom>
          <AccountBalance sx={{ mr: 1, verticalAlign: 'middle' }} />
          账单数据详情
        </Typography>

        {/* 汇总卡片 */}
        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 2, mb: 3 }}>
          <Box sx={{ flex: '1 1 200px', minWidth: '200px' }}>
            <Card variant="outlined">
              <CardContent>
                <Typography color="textSecondary" gutterBottom>
                  订阅名称
                </Typography>
                <Typography variant="h6" component="div">
                  {subscriptions.length > 0 ? data[subscriptions[0]].subscription_name : 'N/A'}
                </Typography>
              </CardContent>
            </Card>
          </Box>
          <Box sx={{ flex: '1 1 200px', minWidth: '200px' }}>
            <Card variant="outlined">
              <CardContent>
                <Typography color="textSecondary" gutterBottom>
                  总成本
                </Typography>
                <Typography variant="h5" component="div" color="primary">
                  ${totalCost.toFixed(2)}
                </Typography>
              </CardContent>
            </Card>
          </Box>
          <Box sx={{ flex: '1 1 200px', minWidth: '200px' }}>
            <Card variant="outlined">
              <CardContent>
                <Typography color="textSecondary" gutterBottom>
                  平均日成本
                </Typography>
                <Typography variant="h6" component="div">
                  ${avgDailyCost.toFixed(2)}
                </Typography>
              </CardContent>
            </Card>
          </Box>
          <Box sx={{ flex: '1 1 200px', minWidth: '200px' }}>
            <Card variant="outlined">
              <CardContent>
                <Typography color="textSecondary" gutterBottom>
                  资源名称
                </Typography>
                <Typography variant="h6" component="div">
                  {Array.from(resourceNames).join(', ') || 'N/A'}
                </Typography>
              </CardContent>
            </Card>
          </Box>
        </Box>

        {/* 使用服务详情 */}
        {serviceDetails.length > 0 && (
          <Box>
            <Typography variant="subtitle1" gutterBottom sx={{ mt: 2 }}>
              <Receipt sx={{ mr: 1, verticalAlign: 'middle' }} />
              使用服务详情
            </Typography>
            <List>
              {serviceDetails.map((service: any, index: number) => (
                <ListItem key={index} divider>
                  <ListItemIcon>
                    <TrendingUp />
                  </ListItemIcon>
                  <ListItemText
                    primary={
                      <Box>
                        <Typography variant="subtitle2">
                          {service.meter}
                        </Typography>
                        <Typography variant="body2" color="textSecondary">
                          用量: {service.usage.toFixed(5)} | 使用日期: {service.date}
                        </Typography>
                        <Typography variant="body2" color="textSecondary">
                          资源: {service.resourceName} | 资源组: {service.resourceGroup}
                        </Typography>
                      </Box>
                    }
                  />
                  <Box sx={{ textAlign: 'right' }}>
                    <Chip
                      label={`$${service.cost.toFixed(2)}`}
                      color={service.cost > 0 ? 'warning' : 'success'}
                      variant="outlined"
                    />
                    <Typography variant="caption" display="block" sx={{ mt: 0.5 }}>
                      {service.currency}
                    </Typography>
                  </Box>
                </ListItem>
              ))}
            </List>
          </Box>
        )}

        {/* 订阅信息 */}
        {subscriptions.length > 0 && (
          <Box sx={{ mt: 2 }}>
            <Typography variant="subtitle2" gutterBottom>
              订阅信息:
            </Typography>
            {subscriptions.map(subscriptionId => (
              <Typography key={subscriptionId} variant="body2" color="textSecondary">
                订阅ID: {subscriptionId}
              </Typography>
            ))}
          </Box>
        )}
      </Paper>
    );
  };

  return (
    <Box sx={{ maxWidth: 1200, mx: 'auto', p: 3 }}>
      <Typography variant="h4" gutterBottom align="center">
        Azure 账单管理中心
      </Typography>
      <Typography variant="body1" color="textSecondary" align="center" sx={{ mb: 3 }}>
        管理 Azure 账单定时查询配置，自动获取账单数据并保存为JSON记录
      </Typography>

      <Box sx={{ borderBottom: 1, borderColor: 'divider', mb: 3 }}>
        <Tabs value={tabValue} onChange={handleTabChange} aria-label="billing tabs">
          <Tab label="定时配置管理" icon={<Schedule />} iconPosition="start" />
          <Tab label="查询历史记录" icon={<History />} iconPosition="start" />
          <Tab label="手动查询" />
        </Tabs>
      </Box>

      {/* 定时配置管理标签页 */}
      {tabValue === 0 && (
        <Box>
          {/* 配置管理工具栏 */}
          <Card sx={{ mb: 3 }}>
            <CardContent>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
                <Typography variant="h6">
                  <Schedule sx={{ mr: 1, verticalAlign: 'middle' }} />
                  JSON定时查询配置
                </Typography>
                <Box sx={{ display: 'flex', gap: 1 }}>
                  <Button
                    variant="contained"
                    startIcon={<Add />}
                    onClick={() => {
                      console.log('🖱️ 添加配置按钮被点击');
                      openConfigDialog();
                    }}
                  >
                    添加配置
                  </Button>
                  <Button
                    variant="outlined"
                    startIcon={<PlayArrow />}
                    onClick={triggerAllQueries}
                    disabled={configsLoading}
                  >
                    执行所有查询
                  </Button>
                </Box>
              </Box>

              <Typography variant="body2" color="textSecondary" sx={{ mb: 2 }}>
                管理Azure账单自动查询配置。每个JSON配置将定时执行账单查询并保存结果。
              </Typography>

              {configsError && (
                <Alert severity="error" sx={{ mb: 2 }}>
                  {configsError}
                </Alert>
              )}

              <Button
                variant="outlined"
                onClick={fetchJsonConfigs}
                startIcon={<Refresh />}
                disabled={configsLoading}
                sx={{ mr: 1 }}
              >
                刷新配置
              </Button>
            </CardContent>
          </Card>

          {/* 配置列表 */}
          <Card>
            <CardContent>
              <Typography variant="h6" gutterBottom>
                <Assessment sx={{ mr: 1, verticalAlign: 'middle' }} />
                配置列表 ({jsonConfigs.length} 个配置)
              </Typography>

              {configsLoading ? (
                <Box sx={{ display: 'flex', justifyContent: 'center', p: 3 }}>
                  <CircularProgress />
                </Box>
              ) : jsonConfigs.length === 0 ? (
                <Box sx={{ textAlign: 'center', p: 3 }}>
                  <Typography variant="body1" color="textSecondary">
                    暂无配置，点击"添加配置"开始创建
                  </Typography>
                </Box>
              ) : (
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                  {jsonConfigs.map((config) => (
                    <Card key={config.id} variant="outlined">
                      <CardContent>
                        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                          <Box sx={{ flex: 1 }}>
                            <Typography variant="h6" gutterBottom>
                              {config.configName}
                            </Typography>
                            <Typography variant="body2" color="textSecondary" gutterBottom>
                              文件: {config.fileName}
                            </Typography>
                            <Typography variant="body2" color="textSecondary" gutterBottom>
                              应用ID: {config.appId}
                            </Typography>
                            <Typography variant="body2" color="textSecondary" gutterBottom>
                              查询间隔: {config.queryIntervalMinutes} 分钟
                            </Typography>
                            <Box sx={{ display: 'flex', gap: 1, mt: 1 }}>
                              <Chip
                                label={config.status === 'active' ? '活跃' : config.status === 'inactive' ? '非活跃' : '错误'}
                                color={config.status === 'active' ? 'success' : config.status === 'inactive' ? 'default' : 'error'}
                                size="small"
                              />
                              <Chip
                                label={config.autoQueryEnabled ? '自动查询' : '手动查询'}
                                color={config.autoQueryEnabled ? 'primary' : 'default'}
                                size="small"
                              />
                            </Box>
                          </Box>
                          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1, ml: 2 }}>
                            <Button
                              variant="outlined"
                              size="small"
                              startIcon={<PlayArrow />}
                              onClick={() => config.id && executeConfig(config.id)}
                              disabled={!config.id}
                            >
                              执行查询
                            </Button>
                            <Button
                              variant="outlined"
                              size="small"
                              startIcon={<Visibility />}
                              onClick={() => config.id && toggleConfigHistory(config.id)}
                              disabled={!config.id}
                            >
                              查看历史
                            </Button>
                            <Button
                              variant="outlined"
                              size="small"
                              startIcon={<Edit />}
                              onClick={() => openConfigDialog(config)}
                            >
                              编辑
                            </Button>
                            <Button
                              variant="outlined"
                              size="small"
                              color="error"
                              startIcon={<Delete />}
                              onClick={() => config.id && deleteConfig(config.id)}
                              disabled={!config.id}
                            >
                              删除
                            </Button>
                          </Box>
                        </Box>

                        {config.lastQueryTime && (
                          <Box sx={{ mt: 2, p: 1, bgcolor: 'grey.50', borderRadius: 1 }}>
                            <Typography variant="caption" color="textSecondary">
                              上次查询: {new Date(config.lastQueryTime).toLocaleString()}
                            </Typography>
                            {config.nextQueryTime && (
                              <Typography variant="caption" color="textSecondary" sx={{ ml: 2 }}>
                                下次查询: {new Date(config.nextQueryTime).toLocaleString()}
                              </Typography>
                            )}
                          </Box>
                        )}

                        {/* 历史记录展开区域 */}
                        {config.id && (
                          <Collapse in={expandedConfigs.has(config.id)}>
                            <Box sx={{ mt: 2, p: 2, bgcolor: 'grey.50', borderRadius: 1 }}>
                              <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
                                <History sx={{ mr: 1, fontSize: 20 }} />
                                <Typography variant="subtitle2">
                                  查询历史记录
                                </Typography>
                                {configHistoryLoading.has(config.id) && (
                                  <CircularProgress size={16} sx={{ ml: 1 }} />
                                )}
                              </Box>

                              {configHistories.has(config.id) ? (
                                <Box>
                                  {configHistories.get(config.id)?.length === 0 ? (
                                    <Typography variant="body2" color="textSecondary" sx={{ textAlign: 'center', py: 2 }}>
                                      暂无查询历史记录
                                    </Typography>
                                  ) : (
                                    <TableContainer component={Paper} variant="outlined" sx={{ maxHeight: 300 }}>
                                      <Table size="small">
                                        <TableHead>
                                          <TableRow>
                                            <TableCell>查询时间</TableCell>
                                            <TableCell>状态</TableCell>
                                            <TableCell>总费用</TableCell>
                                            <TableCell>错误信息</TableCell>
                                          </TableRow>
                                        </TableHead>
                                        <TableBody>
                                          {configHistories.get(config.id)?.map((record) => (
                                            <TableRow key={record.id}>
                                              <TableCell>
                                                <Typography variant="caption">
                                                  {new Date(record.queryDate).toLocaleString()}
                                                </Typography>
                                              </TableCell>
                                              <TableCell>
                                                <Chip
                                                  label={record.queryStatus === 'success' ? '成功' :
                                                         record.queryStatus === 'failed' ? '失败' :
                                                         record.queryStatus === 'no_subscription' ? '无订阅' : '未知'}
                                                  color={record.queryStatus === 'success' ? 'success' : 'error'}
                                                  size="small"
                                                />
                                              </TableCell>
                                              <TableCell>
                                                <Typography variant="caption">
                                                  {record.totalCost ? `${record.totalCost} ${record.currency || 'USD'}` : '-'}
                                                </Typography>
                                              </TableCell>
                                              <TableCell>
                                                <Typography variant="caption" color="error">
                                                  {record.errorMessage || '-'}
                                                </Typography>
                                              </TableCell>
                                            </TableRow>
                                          ))}
                                        </TableBody>
                                      </Table>
                                    </TableContainer>
                                  )}

                                  <Box sx={{ mt: 1, textAlign: 'center' }}>
                                    <Button
                                      size="small"
                                      variant="text"
                                      onClick={() => setTabValue(1)}
                                      sx={{ fontSize: '0.75rem' }}
                                    >
                                      查看完整历史记录
                                    </Button>
                                  </Box>
                                </Box>
                              ) : (
                                <Typography variant="body2" color="textSecondary" sx={{ textAlign: 'center', py: 2 }}>
                                  正在加载历史记录...
                                </Typography>
                              )}
                            </Box>
                          </Collapse>
                        )}
                      </CardContent>
                    </Card>
                  ))}
                </Box>
              )}
            </CardContent>
          </Card>
        </Box>
      )}

      {/* 查询历史记录标签页 */}
      {tabValue === 1 && (
        <Box>
          {/* 筛选条件 */}
          <Card sx={{ mb: 3 }}>
            <CardContent>
              <Typography variant="h6" gutterBottom>
                <FilterList sx={{ mr: 1, verticalAlign: 'middle' }} />
                查询历史筛选
              </Typography>
              <Typography variant="body2" color="textSecondary" sx={{ mb: 2 }}>
                查看和筛选JSON配置的账单查询历史记录
              </Typography>
              <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 2, mb: 2 }}>
                <TextField
                  label="文件名"
                  value={filterFileName}
                  onChange={(e) => setFilterFileName(e.target.value)}
                  size="small"
                  sx={{ minWidth: 200 }}
                />
                <TextField
                  label="开始日期"
                  type="datetime-local"
                  value={filterStartDate}
                  onChange={(e) => setFilterStartDate(e.target.value)}
                  size="small"
                  slotProps={{ inputLabel: { shrink: true } }}
                />
                <TextField
                  label="结束日期"
                  type="datetime-local"
                  value={filterEndDate}
                  onChange={(e) => setFilterEndDate(e.target.value)}
                  size="small"
                  slotProps={{ inputLabel: { shrink: true } }}
                />
              </Box>
              <Box sx={{ display: 'flex', gap: 1 }}>
                <Button
                  variant="contained"
                  onClick={applyFilters}
                  startIcon={<FilterList />}
                  disabled={historyLoading}
                >
                  应用筛选
                </Button>
                <Button
                  variant="outlined"
                  onClick={resetFilters}
                  disabled={historyLoading}
                >
                  重置
                </Button>
                <Button
                  variant="outlined"
                  onClick={fetchHistory}
                  startIcon={<Refresh />}
                  disabled={historyLoading}
                >
                  刷新
                </Button>
              </Box>
            </CardContent>
          </Card>

          {/* 历史记录表格 */}
          <Card>
            <CardContent>
              <Typography variant="h6" gutterBottom>
                <History sx={{ mr: 1, verticalAlign: 'middle' }} />
                JSON文件账单查询历史
              </Typography>

              {historyError && (
                <Alert severity="error" sx={{ mb: 2 }}>
                  {historyError}
                </Alert>
              )}

              {historyLoading ? (
                <Box sx={{ display: 'flex', justifyContent: 'center', p: 3 }}>
                  <CircularProgress />
                </Box>
              ) : (
                <>
                  <TableContainer component={Paper} variant="outlined">
                    <Table size="small">
                      <TableHead>
                        <TableRow>
                          <TableCell>文件名</TableCell>
                          <TableCell>应用ID</TableCell>
                          <TableCell>显示名称</TableCell>
                          <TableCell>查询时间</TableCell>
                          <TableCell>状态</TableCell>
                          <TableCell>总费用</TableCell>
                          <TableCell>错误信息</TableCell>
                        </TableRow>
                      </TableHead>
                      <TableBody>
                        {historyData.length === 0 ? (
                          <TableRow>
                            <TableCell colSpan={7} align="center">
                              <Typography variant="body2" color="textSecondary">
                                暂无历史记录
                              </Typography>
                            </TableCell>
                          </TableRow>
                        ) : (
                          historyData.slice((currentPage - 1) * pageSize, currentPage * pageSize).map((record) => (
                            <TableRow key={record.id}>
                              <TableCell>
                                <Typography variant="body2" sx={{ fontFamily: 'monospace' }}>
                                  {record.fileName}
                                </Typography>
                              </TableCell>
                              <TableCell>
                                <Typography variant="body2" sx={{ fontFamily: 'monospace' }}>
                                  {record.appId}
                                </Typography>
                              </TableCell>
                              <TableCell>{record.displayName}</TableCell>
                              <TableCell>{formatDateString(record.queryDate)}</TableCell>
                              <TableCell>{getStatusChip(record.queryStatus)}</TableCell>
                              <TableCell>
                                {record.totalCost !== null && record.totalCost !== undefined ? (
                                  <Typography variant="body2" color="primary">
                                    ${Number(record.totalCost).toFixed(2)} {record.currency}
                                  </Typography>
                                ) : (
                                  <Typography variant="body2" color="textSecondary">
                                    -
                                  </Typography>
                                )}
                              </TableCell>
                              <TableCell>
                                {record.errorMessage ? (
                                  <Typography variant="body2" color="error" sx={{ maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                    {record.errorMessage}
                                  </Typography>
                                ) : (
                                  <Typography variant="body2" color="textSecondary">
                                    -
                                  </Typography>
                                )}
                              </TableCell>
                            </TableRow>
                          ))
                        )}
                      </TableBody>
                    </Table>
                  </TableContainer>

                  {/* 分页 */}
                  {totalCount > pageSize && (
                    <Box sx={{ display: 'flex', justifyContent: 'center', mt: 2 }}>
                      <Pagination
                        count={Math.ceil(totalCount / pageSize)}
                        page={currentPage}
                        onChange={handlePageChange}
                        color="primary"
                      />
                    </Box>
                  )}

                  <Typography variant="body2" color="textSecondary" sx={{ mt: 2 }}>
                    共 {totalCount} 条记录
                  </Typography>
                </>
              )}
            </CardContent>
          </Card>
        </Box>
      )}

      {/* 手动查询标签页 */}
      {tabValue === 2 && (
        <Box>
          {/* 手动查询工具栏 */}
          <Card sx={{ mb: 3 }}>
            <CardContent>
              <Typography variant="h6" gutterBottom>
                <CloudUpload sx={{ mr: 1, verticalAlign: 'middle' }} />
                手动账单查询
              </Typography>
              <Typography variant="body2" color="textSecondary" sx={{ mb: 2 }}>
                上传Azure凭据文件进行一次性账单查询，不保存为定时配置
              </Typography>

              <Box sx={{ mb: 3 }}>
                <Button
                  variant="outlined"
                  onClick={fetchExample}
                  sx={{ mb: 2 }}
                >
                  查看凭据文件格式示例
                </Button>

                <Collapse in={showExample}>
                  {example && (
                    <Alert severity="info" sx={{ mb: 2 }}>
                      <Typography variant="subtitle2" gutterBottom>
                        凭据文件格式示例:
                      </Typography>
                      <pre style={{ fontSize: '12px', margin: 0 }}>
                        {JSON.stringify(example.example, null, 2)}
                      </pre>
                      <Typography variant="body2" sx={{ mt: 1 }}>
                        使用说明:
                      </Typography>
                      <ul style={{ margin: '8px 0', paddingLeft: '20px' }}>
                        {example.instructions.map((instruction, index) => (
                          <li key={index} style={{ fontSize: '14px' }}>
                            {instruction}
                          </li>
                        ))}
                      </ul>
                    </Alert>
                  )}
                </Collapse>
              </Box>

              <Divider sx={{ my: 2 }} />

              <Box sx={{ mb: 3 }}>
                <Button
                  component="label"
                  variant="contained"
                  startIcon={<CloudUpload />}
                  sx={{ mb: 2 }}
                >
                  选择凭据文件
                  <VisuallyHiddenInput
                    type="file"
                    accept=".json,application/json"
                    onChange={handleFileChange}
                  />
                </Button>

                {file && (
                  <Alert severity="success" sx={{ mb: 2 }}>
                    <Typography variant="body2">
                      已选择文件: {file.name} ({(file.size / 1024).toFixed(1)} KB)
                    </Typography>
                  </Alert>
                )}
              </Box>

              <Button
                variant="contained"
                color="primary"
                onClick={handleUpload}
                disabled={!file || loading}
                fullWidth
                sx={{ mb: 2 }}
              >
                {loading ? (
                  <>
                    <CircularProgress size={20} sx={{ mr: 1 }} />
                    查询中...
                  </>
                ) : (
                  '开始查询账单'
                )}
              </Button>

              {error && (
                <Alert severity="error" sx={{ mb: 2 }}>
                  <Typography variant="body2">{error}</Typography>
                </Alert>
              )}
            </CardContent>
          </Card>

          {/* 查询结果 */}
          {result && (
            <Card>
              <CardContent>
                <Typography variant="h6" gutterBottom>
                  <Assessment sx={{ mr: 1, verticalAlign: 'middle' }} />
                  查询结果
                </Typography>

                <Alert severity="success" sx={{ mb: 2 }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <Typography variant="body2">
                      {result.message}
                    </Typography>
                    <IconButton
                      size="small"
                      onClick={() => setShowDetails(!showDetails)}
                    >
                      {showDetails ? <ExpandLess /> : <ExpandMore />}
                    </IconButton>
                  </Box>
                </Alert>

                {result.credentials_info && (
                  <Paper elevation={1} sx={{ p: 2, mb: 2 }}>
                    <Typography variant="subtitle2" gutterBottom>
                      凭据信息:
                    </Typography>
                    <Typography variant="body2">
                      应用ID: {result.credentials_info.appId}
                    </Typography>
                    <Typography variant="body2">
                      显示名称: {result.credentials_info.displayName}
                    </Typography>
                    <Typography variant="body2">
                      租户ID: {result.credentials_info.tenant}
                    </Typography>
                  </Paper>
                )}

                {result.result?.data && renderBillingData(result.result.data)}

                <Collapse in={showDetails}>
                  {result.result?.output && (
                    <Paper elevation={1} sx={{ p: 2, mt: 2 }}>
                      <Typography variant="subtitle2" gutterBottom>
                        详细输出:
                      </Typography>
                      <pre style={{
                        fontSize: '12px',
                        whiteSpace: 'pre-wrap',
                        maxHeight: '300px',
                        overflow: 'auto',
                        margin: 0
                      }}>
                        {result.result.output}
                      </pre>
                    </Paper>
                  )}
                </Collapse>
              </CardContent>
            </Card>
          )}


        </Box>
      )}

      {/* 配置对话框 - 放在所有标签页外面，确保在任何标签页都能显示 */}
      <Dialog
        open={configDialogOpen}
        onClose={() => setConfigDialogOpen(false)}
        maxWidth="md"
        fullWidth
      >
        <DialogTitle>
          {editingConfig ? '编辑配置' : '添加配置'}
        </DialogTitle>
        <DialogContent>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: 1 }}>
            {/* JSON文件上传区域 */}
            {!editingConfig && (
              <Card sx={{ mb: 2, bgcolor: 'background.default' }}>
                <CardContent>
                  <Typography variant="h6" gutterBottom>
                    上传JSON配置文件
                  </Typography>
                  <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                    上传Azure凭据JSON文件，系统将自动解析并填充配置信息
                  </Typography>
                  <Button
                    component="label"
                    variant="outlined"
                    startIcon={<CloudUpload />}
                    sx={{ mb: 1 }}
                  >
                    选择JSON文件
                    <VisuallyHiddenInput
                      type="file"
                      accept=".json"
                      onChange={handleJsonFileUpload}
                    />
                  </Button>
                  {uploadedFileName && (
                    <Typography variant="body2" color="success.main" sx={{ mt: 1 }}>
                      已上传: {uploadedFileName}
                    </Typography>
                  )}
                </CardContent>
              </Card>
            )}

            <TextField
              label="配置名称"
              value={configForm.configName || ''}
              onChange={(e) => setConfigForm({ ...configForm, configName: e.target.value })}
              fullWidth
              required
            />
            <TextField
              label="JSON文件名"
              value={configForm.fileName || ''}
              onChange={(e) => setConfigForm({ ...configForm, fileName: e.target.value })}
              fullWidth
              required
              helperText="上传文件后会自动填充"
            />
            <TextField
              label="文件路径"
              value={configForm.filePath || ''}
              onChange={(e) => setConfigForm({ ...configForm, filePath: e.target.value })}
              fullWidth
              required
              helperText="上传文件后会自动填充服务器路径"
            />
            <TextField
              label="应用ID"
              value={configForm.appId || ''}
              onChange={(e) => setConfigForm({ ...configForm, appId: e.target.value })}
              fullWidth
              required
              helperText="从JSON文件中自动解析"
            />
            <TextField
              label="租户ID"
              value={configForm.tenantId || ''}
              onChange={(e) => setConfigForm({ ...configForm, tenantId: e.target.value })}
              fullWidth
              required
              helperText="从JSON文件中自动解析"
            />
            <TextField
              label="显示名称"
              value={configForm.displayName || ''}
              onChange={(e) => setConfigForm({ ...configForm, displayName: e.target.value })}
              fullWidth
              required
              helperText="从JSON文件中自动解析"
            />
            <TextField
              label="密码"
              type="password"
              value={configForm.password || ''}
              onChange={(e) => setConfigForm({ ...configForm, password: e.target.value })}
              fullWidth
              required
              helperText="从JSON文件中自动解析"
            />
            <TextField
              label="查询间隔（分钟）"
              type="number"
              value={configForm.queryIntervalMinutes || 60}
              onChange={(e) => setConfigForm({ ...configForm, queryIntervalMinutes: parseInt(e.target.value) || 60 })}
              fullWidth
              slotProps={{ htmlInput: { min: 1, max: 10080 } }}
            />
            <FormControlLabel
              control={
                <Switch
                  checked={configForm.autoQueryEnabled || false}
                  onChange={(e) => setConfigForm({ ...configForm, autoQueryEnabled: e.target.checked })}
                />
              }
              label="启用自动查询"
            />
            <FormControl fullWidth>
              <InputLabel>状态</InputLabel>
              <Select
                value={configForm.status || 'active'}
                onChange={(e) => setConfigForm({ ...configForm, status: e.target.value as 'active' | 'inactive' | 'error' })}
                label="状态"
              >
                <MenuItem value="active">活跃</MenuItem>
                <MenuItem value="inactive">停用</MenuItem>
                <MenuItem value="error">错误</MenuItem>
              </Select>
            </FormControl>
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setConfigDialogOpen(false)}>
            取消
          </Button>
          <Button onClick={saveJsonConfig} variant="contained">
            保存
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default AzureBillingUpload;