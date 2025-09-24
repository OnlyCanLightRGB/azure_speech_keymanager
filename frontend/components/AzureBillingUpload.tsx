import React, { useState, useEffect } from 'react';
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
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Pagination
} from '@mui/material';
import {
  CloudUpload,
  CheckCircle,
  Error as ErrorIcon,
  Info,
  ExpandMore,
  ExpandLess,
  AccountBalance,
  Receipt,
  TrendingUp,
  History,
  Refresh,
  FilterList
} from '@mui/icons-material';
import { styled } from '@mui/material/styles';

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
  const handleTabChange = (event: React.SyntheticEvent, newValue: number) => {
    setTabValue(newValue);
    if (newValue === 1 && historyData.length === 0) {
      fetchHistory();
    }
  };

  // 处理分页
  const handlePageChange = (event: React.ChangeEvent<unknown>, page: number) => {
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

  // 格式化状态
  const getStatusChip = (status: string) => {
    switch (status) {
      case 'success':
        return <Chip label="成功" color="success" size="small" />;
      case 'failed':
        return <Chip label="失败" color="error" size="small" />;
      case 'no_subscription':
        return <Chip label="无订阅" color="warning" size="small" />;
      default:
        return <Chip label="未知" color="default" size="small" />;
    }
  };

  // 当筛选条件或分页改变时重新获取数据
  useEffect(() => {
    if (tabValue === 1) {
      fetchHistory();
    }
  }, [currentPage]);

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('zh-CN', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2
    }).format(amount);
  };

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
    let totalServices = 0;
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

    totalServices = new Set(serviceDetails.map(s => s.meter)).size;
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
        Azure 账单查询
      </Typography>
      <Typography variant="body1" color="textSecondary" align="center" sx={{ mb: 3 }}>
        上传 Azure 应用程序凭据文件，查询相关的账单信息
      </Typography>

      <Box sx={{ borderBottom: 1, borderColor: 'divider', mb: 3 }}>
        <Tabs value={tabValue} onChange={handleTabChange} aria-label="billing tabs">
          <Tab label="账单查询" />
          <Tab label="历史记录" icon={<History />} iconPosition="start" />
        </Tabs>
      </Box>

      {/* 账单查询标签页 */}
      {tabValue === 0 && (
        <Card>
          <CardContent>
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

            {result && (
              <Box>
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
              </Box>
            )}
          </CardContent>
        </Card>
      )}

      {/* 历史记录标签页 */}
      {tabValue === 1 && (
        <Box>
          {/* 筛选条件 */}
          <Card sx={{ mb: 3 }}>
            <CardContent>
              <Typography variant="h6" gutterBottom>
                <FilterList sx={{ mr: 1, verticalAlign: 'middle' }} />
                筛选条件
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
                  InputLabelProps={{ shrink: true }}
                />
                <TextField
                  label="结束日期"
                  type="datetime-local"
                  value={filterEndDate}
                  onChange={(e) => setFilterEndDate(e.target.value)}
                  size="small"
                  InputLabelProps={{ shrink: true }}
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
    </Box>
  );
};

export default AzureBillingUpload;