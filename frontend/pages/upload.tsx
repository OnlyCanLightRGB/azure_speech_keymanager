import React, { useState, useEffect } from 'react';
import {
  Box,
  Button,
  Card,
  CardContent,
  Typography,
  Tabs,
  Tab,
  TextField,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Checkbox,
  FormControlLabel,
  Alert,
  Snackbar,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Chip,
  IconButton,
  Tooltip,
  Accordion,
  AccordionSummary,
  AccordionDetails,
  Divider,
  CircularProgress
} from '@mui/material';
import {
  CloudUpload as UploadIcon,
  Download as DownloadIcon,
  CheckCircle as CheckIcon,
  Error as ErrorIcon,
  ExpandMore as ExpandMoreIcon,
  ContentCopy as CopyIcon,
  Refresh as RefreshIcon,
  PlayArrow as PlayIcon,
  Stop as StopIcon,
  MonitorHeart as MonitoringIcon,
  CloudUpload as CloudUploadIcon,
  Search as SearchIcon,
  AttachMoney as MoneyIcon
} from '@mui/icons-material';
import Layout from '../components/Layout';
import { uploadApi, billingApi } from '../utils/api';
import { 
  ResourceKeyCreationRequest, 
  ResourceKeyCreationResponse, 
  ResourceKeyCreationResult,
  ResourceValidationResponse,
  ResourceValidationResult,
  ResourceKeyItem,
  ResourceCreationOptions,
  BillingMonitoringRequest,
  BillingMonitoringResponse,
  BillingKeyItem,
  BillingMonitoringOptions
} from '../types';

interface TabPanelProps {
  children?: React.ReactNode;
  index: number;
  value: number;
}

function TabPanel(props: TabPanelProps) {
  const { children, value, index, ...other } = props;

  return (
    <div
      role="tabpanel"
      hidden={value !== index}
      id={`upload-tabpanel-${index}`}
      aria-labelledby={`upload-tab-${index}`}
      {...other}
    >
      {value === index && (
        <Box sx={{ p: 3 }}>
          {children}
        </Box>
      )}
    </div>
  );
}

const UploadPage: React.FC = () => {
  const [tabValue, setTabValue] = useState(0);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [subscriptionId, setSubscriptionId] = useState<string>('581895b1-f065-4b31-94c2-97d0cb121bd0');
  const [startDate, setStartDate] = useState<string>('');
  const [endDate, setEndDate] = useState<string>('');
  const [billingData, setBillingData] = useState<any>(null);
  const [balanceData, setBalanceData] = useState<any>(null);
  const [usageStats, setUsageStats] = useState<any>(null);
  const [cognitiveServices, setCognitiveServices] = useState<any[]>([]);
  const [billingLoading, setBillingLoading] = useState<boolean>(false);
  const [billingJsonFile, setBillingJsonFile] = useState<File | null>(null);
  const [jsonBillingData, setJsonBillingData] = useState<any>(null);

  const [creationOptions, setCreationOptions] = useState<ResourceCreationOptions>({
    overwrite: false,
    validateBeforeCreate: true,
    enableAfterCreate: true,
    setDefaultRegion: false
  });
  
  // Azure资源创建相关状态
  const [resourceType, setResourceType] = useState<'speech' | 'translation'>('speech');
  const [azureSubscriptionId, setAzureSubscriptionId] = useState<string>('');
  const [resourceGroupName, setResourceGroupName] = useState<string>('');
  const [resourceName, setResourceName] = useState<string>('');
  const [location, setLocation] = useState<string>('East Asia');
  const [sku, setSku] = useState<string>('F0');
  const [createResourceGroup, setCreateResourceGroup] = useState<boolean>(true);
  const [enableAfterCreate, setEnableAfterCreate] = useState<boolean>(true);
  
  const [uploadResult, setUploadResult] = useState<ResourceKeyCreationResponse | null>(null);
  const [validationResult, setValidationResult] = useState<ResourceValidationResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [snackbar, setSnackbar] = useState({ open: false, message: '', severity: 'success' as 'success' | 'error' });
  

  


  const handleTabChange = (event: React.SyntheticEvent, newValue: number) => {
    setTabValue(newValue);
  };













  const showSnackbar = (message: string, severity: 'success' | 'error' = 'success') => {
    setSnackbar({ open: true, message, severity });
  };

  // 账单查询相关函数
  const handleBillingUsageQuery = async () => {
    if (!subscriptionId.trim()) {
      showSnackbar('请输入订阅ID', 'error');
      return;
    }

    setBillingLoading(true);
    try {
      const usage = await billingApi.getBillingUsage(subscriptionId, startDate || undefined, endDate || undefined);
      setBillingData(usage);
      showSnackbar('账单使用详情查询成功');
    } catch (error: any) {
      showSnackbar(`查询失败: ${error.message}`, 'error');
    } finally {
      setBillingLoading(false);
    }
  };

  const handleBalanceQuery = async () => {
    if (!subscriptionId.trim()) {
      showSnackbar('请输入订阅ID', 'error');
      return;
    }

    setBillingLoading(true);
    try {
      const balance = await billingApi.getAccountBalance(subscriptionId);
      setBalanceData(balance);
      showSnackbar('账户余额查询成功');
    } catch (error: any) {
      showSnackbar(`查询失败: ${error.message}`, 'error');
    } finally {
      setBillingLoading(false);
    }
  };

  const handleUsageStatsQuery = async () => {
    if (!subscriptionId.trim()) {
      showSnackbar('请输入订阅ID', 'error');
      return;
    }

    setBillingLoading(true);
    try {
      const stats = await billingApi.getUsageStatistics(subscriptionId);
      setUsageStats(stats);
      showSnackbar('使用统计查询成功');
    } catch (error: any) {
      showSnackbar(`查询失败: ${error.message}`, 'error');
    } finally {
      setBillingLoading(false);
    }
  };

  const handleCognitiveServicesQuery = async () => {
    if (!subscriptionId.trim()) {
      showSnackbar('请输入订阅ID', 'error');
      return;
    }

    setBillingLoading(true);
    try {
      const services = await billingApi.getCognitiveServicesBilling(subscriptionId);
      setCognitiveServices(services);
      showSnackbar('认知服务账单查询成功');
    } catch (error: any) {
      showSnackbar(`查询失败: ${error.message}`, 'error');
    } finally {
      setBillingLoading(false);
    }
  };

  const handleQueryAll = async () => {
    if (!subscriptionId.trim()) {
      showSnackbar('请输入订阅ID', 'error');
      return;
    }

    setBillingLoading(true);
    try {
      const [usage, balance, stats, services] = await Promise.all([
        billingApi.getBillingUsage(subscriptionId, startDate || undefined, endDate || undefined),
        billingApi.getAccountBalance(subscriptionId),
        billingApi.getUsageStatistics(subscriptionId),
        billingApi.getCognitiveServicesBilling(subscriptionId)
      ]);
      
      setBillingData(usage);
      setBalanceData(balance);
      setUsageStats(stats);
      setCognitiveServices(services);
      showSnackbar('所有账单信息查询成功');
    } catch (error: any) {
      showSnackbar(`查询失败: ${error.message}`, 'error');
    } finally {
      setBillingLoading(false);
    }
  };

  const handleBillingJsonFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file && file.type === 'application/json') {
      setBillingJsonFile(file);
    } else {
      showSnackbar('请选择有效的JSON文件', 'error');
    }
  };

  const handleJsonBillingQuery = async () => {
    if (!billingJsonFile) {
      showSnackbar('请先选择包含认证信息的JSON文件', 'error');
      return;
    }

    setBillingLoading(true);
    try {
      // 读取JSON文件内容
      const fileContent = await billingJsonFile.text();
      const jsonData = JSON.parse(fileContent);
      
      // 验证JSON格式
      if (!jsonData.subscriptionId) {
        showSnackbar('JSON文件中缺少subscriptionId字段', 'error');
        return;
      }

      // 使用JSON中的订阅ID查询账单
      const targetSubscriptionId = jsonData.subscriptionId;
      
      const [usage, balance, stats, services] = await Promise.all([
        billingApi.getBillingUsage(targetSubscriptionId, startDate || undefined, endDate || undefined),
        billingApi.getAccountBalance(targetSubscriptionId),
        billingApi.getUsageStatistics(targetSubscriptionId),
        billingApi.getCognitiveServicesBilling(targetSubscriptionId)
      ]);
      
      // 将结果保存到专门的JSON查询结果状态
      setJsonBillingData({
        subscriptionId: targetSubscriptionId,
        usage,
        balance,
        stats,
        services,
        jsonConfig: jsonData
      });
      
      showSnackbar(`使用JSON配置查询订阅 ${targetSubscriptionId} 的账单信息成功`);
    } catch (error: any) {
      if (error instanceof SyntaxError) {
        showSnackbar('JSON文件格式错误，请检查文件内容', 'error');
      } else {
        showSnackbar(`查询失败: ${error.message}`, 'error');
      }
    } finally {
      setBillingLoading(false);
    }
  };

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file && file.type === 'application/json') {
      setSelectedFile(file);
    } else {
      showSnackbar('请选择有效的JSON文件', 'error');
    }
  };

  const handleCreateResources = async () => {
    if (!selectedFile) {
      showSnackbar('请先选择JSON文件', 'error');
      return;
    }

    setLoading(true);
    try {
      // 检查文件内容以确定是否为Azure服务主体凭据格式
      const fileContent = await selectedFile.text();
      const fileData = JSON.parse(fileContent);
      
      const isAzureCredentials = fileData.appId && fileData.password && fileData.tenant;
      
      if (isAzureCredentials) {
        // 对于Azure服务主体凭据，需要传递额外参数
        const result = await uploadApi.createResourcesWithCredentials(
          selectedFile,
          {
            resourceType,
            subscriptionId: azureSubscriptionId,
            resourceGroupName,
            resourceName,
            location,
            sku,
            createResourceGroup,
            enableAfterCreate
          }
        );
        setUploadResult(result);
        showSnackbar(result.message);
      } else {
        // 原有的资源创建请求格式
        const result = await uploadApi.createResources(selectedFile);
        setUploadResult(result);
        showSnackbar(result.message);
      }
    } catch (error: any) {
      showSnackbar(`创建资源失败: ${error.message}`, 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleValidateResources = async () => {
    if (!selectedFile) {
      showSnackbar('请先选择JSON文件', 'error');
      return;
    }

    setLoading(true);
    try {
      const result = await uploadApi.validateResources(selectedFile);
      setValidationResult(result);
      showSnackbar(result.message);
    } catch (error: any) {
      showSnackbar(`验证资源失败: ${error.message}`, 'error');
    } finally {
      setLoading(false);
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    showSnackbar('已复制到剪贴板');
  };

  const getStatusColor = (success: boolean) => {
    return success ? 'success' : 'error';
  };

  const getStatusIcon = (success: boolean) => {
    return success ? <CheckIcon color="success" /> : <ErrorIcon color="error" />;
  };

  return (
    <Layout>
      <Box>
        <Typography variant="h4" component="h1" sx={{ mb: 3 }}>
          资源管理 - JSON上传
        </Typography>

        <Card sx={{ mb: 3 }}>
          <CardContent>
            <Typography variant="h6" sx={{ mb: 2 }}>
              支持通过JSON文件实时创建语音资源key和翻译资源key
            </Typography>
            <Typography variant="body2" color="text.secondary">
              您可以上传包含Azure语音服务或翻译服务订阅密钥的JSON文件，系统将自动创建相应的资源并配置到系统中。
            </Typography>
          </CardContent>
        </Card>

        <Box sx={{ borderBottom: 1, borderColor: 'divider' }}>
          <Tabs value={tabValue} onChange={handleTabChange} aria-label="upload tabs">
            <Tab label="创建资源" />
              <Tab label="验证资源" />
              <Tab label="账单查询" />
          </Tabs>
        </Box>

        {/* 创建资源标签页 */}
        <TabPanel value={tabValue} index={0}>
          <Box sx={{ display: 'flex', flexDirection: { xs: 'column', md: 'row' }, gap: 3 }}>
            <Box sx={{ flex: 1 }}>
              <Card>
                <CardContent>
                  <Typography variant="h6" sx={{ mb: 2 }}>
                    上传配置
                  </Typography>
                  


                  <Box sx={{ mb: 2 }}>
                    <input
                      accept=".json"
                      style={{ display: 'none' }}
                      id="file-upload"
                      type="file"
                      onChange={handleFileSelect}
                    />
                    <label htmlFor="file-upload">
                      <Button
                        variant="outlined"
                        component="span"
                        startIcon={<UploadIcon />}
                        fullWidth
                      >
                        选择JSON文件
                      </Button>
                    </label>
                    {selectedFile && (
                      <Typography variant="body2" sx={{ mt: 1, color: 'success.main' }}>
                        已选择: {selectedFile.name}
                      </Typography>
                    )}
                  </Box>

                  <Typography variant="subtitle2" sx={{ mb: 1 }}>
                    创建选项
                  </Typography>
                  
                  <FormControlLabel
                    control={
                      <Checkbox
                        checked={creationOptions.validateBeforeCreate}
                        onChange={(e) => setCreationOptions({
                          ...creationOptions,
                          validateBeforeCreate: e.target.checked
                        })}
                      />
                    }
                    label="创建前验证"
                  />
                  
                  <FormControlLabel
                    control={
                      <Checkbox
                        checked={creationOptions.enableAfterCreate}
                        onChange={(e) => setCreationOptions({
                          ...creationOptions,
                          enableAfterCreate: e.target.checked
                        })}
                      />
                    }
                    label="创建后自动启用"
                  />

                  <Divider sx={{ my: 2 }} />
                  
                  <Typography variant="h6" sx={{ mb: 2 }}>
                    Azure资源创建配置
                  </Typography>
                  
                  <Box sx={{ mb: 2 }}>
                    <FormControl fullWidth sx={{ mb: 2 }}>
                      <InputLabel>Azure资源类型</InputLabel>
                      <Select
                        value={resourceType}
                        label="Azure资源类型"
                        onChange={(e) => setResourceType(e.target.value as 'speech' | 'translation')}
                      >
                        <MenuItem value="speech">语音服务</MenuItem>
                        <MenuItem value="translation">翻译服务</MenuItem>
                      </Select>
                    </FormControl>

                    <TextField
                      fullWidth
                      label="订阅ID"
                      value={azureSubscriptionId}
                      onChange={(e) => setAzureSubscriptionId(e.target.value)}
                      sx={{ mb: 2 }}
                      placeholder="输入Azure订阅ID"
                    />

                    <TextField
                      fullWidth
                      label="资源组名称"
                      value={resourceGroupName}
                      onChange={(e) => setResourceGroupName(e.target.value)}
                      sx={{ mb: 2 }}
                      placeholder="输入资源组名称"
                    />

                    <TextField
                      fullWidth
                      label="资源名称"
                      value={resourceName}
                      onChange={(e) => setResourceName(e.target.value)}
                      sx={{ mb: 2 }}
                      placeholder="输入资源名称"
                    />

                    <TextField
                      fullWidth
                      label="位置"
                      value={location}
                      onChange={(e) => setLocation(e.target.value)}
                      sx={{ mb: 2 }}
                      placeholder="例如: eastus"
                    />

                    <TextField
                      fullWidth
                      label="SKU"
                      value={sku}
                      onChange={(e) => setSku(e.target.value)}
                      sx={{ mb: 2 }}
                      placeholder="例如: S0"
                    />

                    <FormControlLabel
                      control={
                        <Checkbox
                          checked={createResourceGroup}
                          onChange={(e) => setCreateResourceGroup(e.target.checked)}
                        />
                      }
                      label="创建资源组（如果不存在）"
                      sx={{ mb: 1 }}
                    />

                    <FormControlLabel
                      control={
                        <Checkbox
                          checked={enableAfterCreate}
                          onChange={(e) => setEnableAfterCreate(e.target.checked)}
                        />
                      }
                      label="创建后启用资源"
                      sx={{ mb: 2 }}
                    />
                  </Box>

                  <Button
                    variant="contained"
                    onClick={handleCreateResources}
                    disabled={!selectedFile || loading}
                    fullWidth
                    sx={{ mt: 2 }}
                    startIcon={loading ? <CircularProgress size={20} /> : <PlayIcon />}
                  >
                    {loading ? '创建中...' : '创建资源'}
                  </Button>
                </CardContent>
              </Card>
            </Box>
            
            <Box sx={{ flex: 1 }}>
              <Card>
                <CardContent>
                  <Typography variant="h6" sx={{ mb: 2 }}>
                    操作结果
                  </Typography>
                  
                  {uploadResult ? (
                    <Box>
                      <Alert severity="success" sx={{ mb: 2 }}>
                        {uploadResult.message}
                      </Alert>
                      
                      <Typography variant="body2" sx={{ mb: 1 }}>
                        总计: {uploadResult.data.total} | 成功: {uploadResult.data.success} | 失败: {uploadResult.data.failed}
                      </Typography>

                      <Accordion>
                        <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                          <Typography>查看详细结果</Typography>
                        </AccordionSummary>
                        <AccordionDetails>
                          <TableContainer component={Paper} variant="outlined">
                            <Table size="small">
                              <TableHead>
                                <TableRow>
                                  <TableCell>密钥</TableCell>
                                  <TableCell>状态</TableCell>
                                  <TableCell>消息</TableCell>
                                  <TableCell>操作</TableCell>
                                </TableRow>
                              </TableHead>
                              <TableBody>
                                {uploadResult.data.results.map((result, index) => (
                                  <TableRow key={index}>
                                    <TableCell>
                                      <Typography variant="body2" component="code" sx={{ fontSize: '12px' }}>
                                        {result.key.length > 16 ? `${result.key.substring(0, 8)}...${result.key.substring(result.key.length - 4)}` : result.key}
                                      </Typography>
                                    </TableCell>
                                    <TableCell>
                                      <Chip
                                        icon={getStatusIcon(result.success)}
                                        label={result.success ? '成功' : '失败'}
                                        color={getStatusColor(result.success)}
                                        size="small"
                                      />
                                    </TableCell>
                                    <TableCell>{result.message}</TableCell>
                                    <TableCell>
                                      {result.endpoint && (
                                        <Tooltip title="复制端点">
                                          <IconButton
                                            size="small"
                                            onClick={() => copyToClipboard(result.endpoint!)}
                                          >
                                            <CopyIcon fontSize="small" />
                                          </IconButton>
                                        </Tooltip>
                                      )}
                                    </TableCell>
                                  </TableRow>
                                ))}
                              </TableBody>
                            </Table>
                          </TableContainer>
                        </AccordionDetails>
                      </Accordion>
                    </Box>
                  ) : (
                    <Typography variant="body2" color="text.secondary">
                      请上传JSON文件并点击创建资源按钮
                    </Typography>
                  )}
                </CardContent>
              </Card>
            </Box>
          </Box>
        </TabPanel>

        {/* 验证资源标签页 */}
        <TabPanel value={tabValue} index={1}>
          <Box sx={{ display: 'flex', flexDirection: { xs: 'column', md: 'row' }, gap: 3 }}>
            <Box sx={{ flex: 1 }}>
              <Card>
                <CardContent>
                  <Typography variant="h6" sx={{ mb: 2 }}>
                    验证配置
                  </Typography>
                  


                  <Box sx={{ mb: 2 }}>
                    <input
                      accept=".json"
                      style={{ display: 'none' }}
                      id="validation-file-upload"
                      type="file"
                      onChange={handleFileSelect}
                    />
                    <label htmlFor="validation-file-upload">
                      <Button
                        variant="outlined"
                        component="span"
                        startIcon={<UploadIcon />}
                        fullWidth
                      >
                        选择JSON文件
                      </Button>
                    </label>
                    {selectedFile && (
                      <Typography variant="body2" sx={{ mt: 1, color: 'success.main' }}>
                        已选择: {selectedFile.name}
                      </Typography>
                    )}
                  </Box>

                  <Button
                    variant="contained"
                    onClick={handleValidateResources}
                    disabled={!selectedFile || loading}
                    fullWidth
                    startIcon={loading ? <CircularProgress size={20} /> : <CheckIcon />}
                  >
                    {loading ? '验证中...' : '验证资源'}
                  </Button>
                </CardContent>
              </Card>
            </Box>
             
             <Box sx={{ flex: 1 }}>
              <Card>
                <CardContent>
                  <Typography variant="h6" sx={{ mb: 2 }}>
                    验证结果
                  </Typography>
                  
                  {validationResult ? (
                    <Box>
                      <Alert severity="success" sx={{ mb: 2 }}>
                        {validationResult.message}
                      </Alert>
                      
                      <Typography variant="body2" sx={{ mb: 1 }}>
                        总计: {validationResult.data.total} | 有效: {validationResult.data.valid} | 无效: {validationResult.data.invalid}
                      </Typography>

                      <Accordion>
                        <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                          <Typography>查看详细结果</Typography>
                        </AccordionSummary>
                        <AccordionDetails>
                          <TableContainer component={Paper} variant="outlined">
                            <Table size="small">
                              <TableHead>
                                <TableRow>
                                  <TableCell>密钥</TableCell>
                                  <TableCell>状态</TableCell>
                                  <TableCell>消息</TableCell>
                                  <TableCell>区域</TableCell>
                                </TableRow>
                              </TableHead>
                              <TableBody>
                                {validationResult.data.results.map((result, index) => (
                                  <TableRow key={index}>
                                    <TableCell>
                                      <Typography variant="body2" component="code" sx={{ fontSize: '12px' }}>
                                        {result.key.length > 16 ? `${result.key.substring(0, 8)}...${result.key.substring(result.key.length - 4)}` : result.key}
                                      </Typography>
                                    </TableCell>
                                    <TableCell>
                                      <Chip
                                        icon={getStatusIcon(result.valid)}
                                        label={result.valid ? '有效' : '无效'}
                                        color={getStatusColor(result.valid)}
                                        size="small"
                                      />
                                    </TableCell>
                                    <TableCell>{result.message}</TableCell>
                                    <TableCell>{result.region || '-'}</TableCell>
                                  </TableRow>
                                ))}
                              </TableBody>
                            </Table>
                          </TableContainer>
                        </AccordionDetails>
                      </Accordion>
                    </Box>
                  ) : (
                    <Typography variant="body2" color="text.secondary">
                      请上传JSON文件并点击验证资源按钮
                    </Typography>
                  )}
                </CardContent>
              </Card>
            </Box>
          </Box>
        </TabPanel>

        {/* 账单查询标签页 */}
        <TabPanel value={tabValue} index={2}>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
            {/* 手动输入查询 */}
            <Card>
              <CardContent>
                <Typography variant="h6" sx={{ mb: 2 }}>
                  手动输入查询
                </Typography>
                
                <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
                  直接输入Azure订阅ID查询账单使用详情、账户余额、使用统计和认知服务账单信息。
                </Typography>

                <TextField
                  fullWidth
                  label="订阅ID"
                  value={subscriptionId}
                  onChange={(e) => setSubscriptionId(e.target.value)}
                  placeholder="请输入Azure订阅ID"
                  sx={{ mb: 2 }}
                />

              <Box sx={{ display: 'flex', gap: 2, mb: 3 }}>
                <TextField
                  label="开始日期"
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  InputLabelProps={{ shrink: true }}
                  sx={{ flex: 1 }}
                />
                <TextField
                  label="结束日期"
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  InputLabelProps={{ shrink: true }}
                  sx={{ flex: 1 }}
                />
              </Box>

              <Box sx={{ display: 'flex', gap: 2, mb: 3, flexWrap: 'wrap' }}>
                <Button
                  variant="contained"
                  onClick={handleBillingUsageQuery}
                  disabled={billingLoading}
                  startIcon={billingLoading ? <CircularProgress size={20} /> : <SearchIcon />}
                >
                  查询使用详情
                </Button>
                <Button
                  variant="outlined"
                  onClick={handleBalanceQuery}
                  disabled={billingLoading}
                  startIcon={billingLoading ? <CircularProgress size={20} /> : <MoneyIcon />}
                >
                  查询账户余额
                </Button>
                <Button
                  variant="outlined"
                  onClick={handleUsageStatsQuery}
                  disabled={billingLoading}
                  startIcon={billingLoading ? <CircularProgress size={20} /> : <MonitoringIcon />}
                >
                  查询使用统计
                </Button>
                <Button
                  variant="outlined"
                  onClick={handleCognitiveServicesQuery}
                  disabled={billingLoading}
                  startIcon={billingLoading ? <CircularProgress size={20} /> : <SearchIcon />}
                >
                  查询认知服务
                </Button>
                <Button
                  variant="contained"
                  color="secondary"
                  onClick={handleQueryAll}
                  disabled={billingLoading}
                  startIcon={billingLoading ? <CircularProgress size={20} /> : <SearchIcon />}
                >
                  查询全部
                </Button>
              </Box>
                </CardContent>
            </Card>

            {/* JSON上传查询 */}
            <Card>
              <CardContent>
                <Typography variant="h6" sx={{ mb: 2 }}>
                  JSON配置查询
                </Typography>
                
                <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
                  上传包含Azure认证信息和订阅ID的JSON文件来查询账单明细。JSON文件应包含subscriptionId字段。
                </Typography>

                <Box sx={{ mb: 2 }}>
                  <input
                    accept=".json"
                    style={{ display: 'none' }}
                    id="billing-json-upload"
                    type="file"
                    onChange={handleBillingJsonFileSelect}
                  />
                  <label htmlFor="billing-json-upload">
                    <Button
                      variant="outlined"
                      component="span"
                      startIcon={<CloudUploadIcon />}
                      fullWidth
                    >
                      选择账单查询JSON文件
                    </Button>
                  </label>
                  {billingJsonFile && (
                    <Typography variant="body2" sx={{ mt: 1, color: 'success.main' }}>
                      已选择: {billingJsonFile.name}
                    </Typography>
                  )}
                </Box>

                <Box sx={{ display: 'flex', gap: 2, mb: 3 }}>
                  <TextField
                    label="开始日期"
                    type="date"
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                    InputLabelProps={{ shrink: true }}
                    sx={{ flex: 1 }}
                  />
                  <TextField
                    label="结束日期"
                    type="date"
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                    InputLabelProps={{ shrink: true }}
                    sx={{ flex: 1 }}
                  />
                </Box>

                <Button
                  variant="contained"
                  onClick={handleJsonBillingQuery}
                  disabled={!billingJsonFile || billingLoading}
                  fullWidth
                  startIcon={billingLoading ? <CircularProgress size={20} /> : <SearchIcon />}
                >
                  {billingLoading ? '查询中...' : '使用JSON查询账单'}
                </Button>
              </CardContent>
            </Card>

            {/* 查询结果显示区域 */}
            <Card>
              <CardContent>
                <Typography variant="h6" sx={{ mb: 2 }}>
                  查询结果
                </Typography>

              {/* JSON查询结果 */}
              {jsonBillingData && (
                <Accordion sx={{ mb: 2 }}>
                  <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                    <Typography variant="h6">JSON配置查询结果 - 订阅: {jsonBillingData.subscriptionId}</Typography>
                  </AccordionSummary>
                  <AccordionDetails>
                    <Box sx={{ mb: 3 }}>
                      <Typography variant="subtitle1" sx={{ mb: 2 }}>配置信息</Typography>
                      <Paper sx={{ p: 2, mb: 2, backgroundColor: 'grey.50' }}>
                        <Typography variant="body2" component="pre" sx={{ fontSize: '12px', overflow: 'auto' }}>
                          {JSON.stringify(jsonBillingData.jsonConfig, null, 2)}
                        </Typography>
                      </Paper>
                    </Box>
                    
                    {/* JSON查询的账户余额 */}
                    {jsonBillingData.balance && (
                      <Box sx={{ mb: 3 }}>
                        <Typography variant="subtitle1" sx={{ mb: 2 }}>账户余额</Typography>
                        <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 2 }}>
                          <Paper sx={{ p: 2 }}>
                            <Typography variant="body2" color="text.secondary">可用余额</Typography>
                            <Typography variant="h6" color="primary">
                              {jsonBillingData.balance.availableCredit?.toFixed(2) || 'N/A'} {jsonBillingData.balance.currency || 'USD'}
                            </Typography>
                          </Paper>
                          <Paper sx={{ p: 2 }}>
                            <Typography variant="body2" color="text.secondary">总余额</Typography>
                            <Typography variant="h6">
                              {jsonBillingData.balance.totalCredit?.toFixed(2) || 'N/A'} {jsonBillingData.balance.currency || 'USD'}
                            </Typography>
                          </Paper>
                          <Paper sx={{ p: 2 }}>
                            <Typography variant="body2" color="text.secondary">已使用</Typography>
                            <Typography variant="h6" color="error">
                              {jsonBillingData.balance.usedCredit?.toFixed(2) || 'N/A'} {jsonBillingData.balance.currency || 'USD'}
                            </Typography>
                          </Paper>
                        </Box>
                      </Box>
                    )}
                    
                    {/* JSON查询的使用详情 */}
                    {jsonBillingData.usage && (
                      <Box sx={{ mb: 3 }}>
                        <Typography variant="subtitle1" sx={{ mb: 2 }}>使用详情</Typography>
                        <Typography variant="body1" sx={{ mb: 2 }}>
                          <strong>查询周期:</strong> {jsonBillingData.usage.startDate} 至 {jsonBillingData.usage.endDate}
                        </Typography>
                        <Typography variant="body1" sx={{ mb: 2 }}>
                          <strong>总费用:</strong> {jsonBillingData.usage.totalCost?.toFixed(2) || 'N/A'} {jsonBillingData.usage.currency || 'USD'}
                        </Typography>
                      </Box>
                    )}
                  </AccordionDetails>
                </Accordion>
              )}

              {/* 账户余额结果 */}
              {balanceData && (
                <Accordion sx={{ mb: 2 }}>
                  <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                    <Typography variant="h6">账户余额信息</Typography>
                  </AccordionSummary>
                  <AccordionDetails>
                    <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 2 }}>
                      <Paper sx={{ p: 2 }}>
                        <Typography variant="body2" color="text.secondary">可用余额</Typography>
                        <Typography variant="h6" color="primary">
                          {balanceData.availableCredit?.toFixed(2) || 'N/A'} {balanceData.currency || 'USD'}
                        </Typography>
                      </Paper>
                      <Paper sx={{ p: 2 }}>
                        <Typography variant="body2" color="text.secondary">总余额</Typography>
                        <Typography variant="h6">
                          {balanceData.totalCredit?.toFixed(2) || 'N/A'} {balanceData.currency || 'USD'}
                        </Typography>
                      </Paper>
                      <Paper sx={{ p: 2 }}>
                        <Typography variant="body2" color="text.secondary">已使用</Typography>
                        <Typography variant="h6" color="error">
                          {balanceData.usedCredit?.toFixed(2) || 'N/A'} {balanceData.currency || 'USD'}
                        </Typography>
                      </Paper>
                      {balanceData.remainingDays && (
                        <Paper sx={{ p: 2 }}>
                          <Typography variant="body2" color="text.secondary">剩余天数</Typography>
                          <Typography variant="h6">{balanceData.remainingDays} 天</Typography>
                        </Paper>
                      )}
                    </Box>
                  </AccordionDetails>
                </Accordion>
              )}

              {/* 使用统计结果 */}
              {usageStats && (
                <Accordion sx={{ mb: 2 }}>
                  <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                    <Typography variant="h6">使用统计信息</Typography>
                  </AccordionSummary>
                  <AccordionDetails>
                    <Box sx={{ mb: 3 }}>
                      <Typography variant="subtitle1" sx={{ mb: 2 }}>当前计费周期</Typography>
                      <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 2, mb: 3 }}>
                        <Paper sx={{ p: 2 }}>
                          <Typography variant="body2" color="text.secondary">周期费用</Typography>
                          <Typography variant="h6" color="primary">
                            {usageStats.currentPeriod?.totalCost?.toFixed(2) || 'N/A'} USD
                          </Typography>
                        </Paper>
                        <Paper sx={{ p: 2 }}>
                          <Typography variant="body2" color="text.secondary">总使用量</Typography>
                          <Typography variant="h6">
                            {usageStats.currentPeriod?.totalUsage?.toLocaleString() || 'N/A'}
                          </Typography>
                        </Paper>
                      </Box>
                    </Box>
                    
                    <Typography variant="subtitle1" sx={{ mb: 2 }}>服务使用情况</Typography>
                    <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: 2 }}>
                      {usageStats.serviceUsage?.speechServices && (
                        <Paper sx={{ p: 2 }}>
                          <Typography variant="body2" color="text.secondary">语音服务</Typography>
                          <Typography variant="body1">API调用: {usageStats.serviceUsage.speechServices.apiCalls?.toLocaleString() || 'N/A'}</Typography>
                          <Typography variant="body1">费用: {usageStats.serviceUsage.speechServices.cost?.toFixed(2) || 'N/A'} USD</Typography>
                          {usageStats.serviceUsage.speechServices.audioMinutes && (
                            <Typography variant="body1">音频分钟: {usageStats.serviceUsage.speechServices.audioMinutes.toLocaleString()}</Typography>
                          )}
                        </Paper>
                      )}
                      {usageStats.serviceUsage?.translationServices && (
                        <Paper sx={{ p: 2 }}>
                          <Typography variant="body2" color="text.secondary">翻译服务</Typography>
                          <Typography variant="body1">API调用: {usageStats.serviceUsage.translationServices.apiCalls?.toLocaleString() || 'N/A'}</Typography>
                          <Typography variant="body1">费用: {usageStats.serviceUsage.translationServices.cost?.toFixed(2) || 'N/A'} USD</Typography>
                          {usageStats.serviceUsage.translationServices.charactersTranslated && (
                            <Typography variant="body1">翻译字符: {usageStats.serviceUsage.translationServices.charactersTranslated.toLocaleString()}</Typography>
                          )}
                        </Paper>
                      )}
                    </Box>
                  </AccordionDetails>
                </Accordion>
              )}

              {/* 账单使用详情结果 */}
              {billingData && (
                <Accordion sx={{ mb: 2 }}>
                  <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                    <Typography variant="h6">账单使用详情</Typography>
                  </AccordionSummary>
                  <AccordionDetails>
                    <Box sx={{ mb: 2 }}>
                      <Typography variant="body1">
                        <strong>查询周期:</strong> {billingData.startDate} 至 {billingData.endDate}
                      </Typography>
                      <Typography variant="body1">
                        <strong>总费用:</strong> {billingData.totalCost?.toFixed(2) || 'N/A'} {billingData.currency || 'USD'}
                      </Typography>
                    </Box>
                    
                    {billingData.usageDetails && billingData.usageDetails.length > 0 && (
                      <TableContainer component={Paper}>
                        <Table size="small">
                          <TableHead>
                            <TableRow>
                              <TableCell>资源名称</TableCell>
                              <TableCell>计量类别</TableCell>
                              <TableCell>使用量</TableCell>
                              <TableCell>单价</TableCell>
                              <TableCell>费用</TableCell>
                              <TableCell>货币</TableCell>
                            </TableRow>
                          </TableHead>
                          <TableBody>
                            {billingData.usageDetails.slice(0, 10).map((usage: any, index: number) => (
                              <TableRow key={index}>
                                <TableCell>{usage.name || 'N/A'}</TableCell>
                                <TableCell>{usage.meterCategory || 'N/A'}</TableCell>
                                <TableCell>{usage.quantity?.toFixed(2) || 'N/A'}</TableCell>
                                <TableCell>{usage.unitPrice?.toFixed(4) || 'N/A'}</TableCell>
                                <TableCell>{usage.cost?.toFixed(2) || 'N/A'}</TableCell>
                                <TableCell>{usage.currency || 'USD'}</TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </TableContainer>
                    )}
                  </AccordionDetails>
                </Accordion>
              )}

              {/* 认知服务账单结果 */}
              {cognitiveServices && cognitiveServices.length > 0 && (
                <Accordion sx={{ mb: 2 }}>
                  <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                    <Typography variant="h6">认知服务账单</Typography>
                  </AccordionSummary>
                  <AccordionDetails>
                    <TableContainer component={Paper}>
                      <Table size="small">
                        <TableHead>
                          <TableRow>
                            <TableCell>资源名称</TableCell>
                            <TableCell>资源类型</TableCell>
                            <TableCell>位置</TableCell>
                            <TableCell>语音服务费用</TableCell>
                            <TableCell>翻译服务费用</TableCell>
                            <TableCell>其他费用</TableCell>
                            <TableCell>总费用</TableCell>
                          </TableRow>
                        </TableHead>
                        <TableBody>
                          {cognitiveServices.map((service: any, index: number) => (
                            <TableRow key={index}>
                              <TableCell>{service.resourceName || 'N/A'}</TableCell>
                              <TableCell>{service.resourceType || 'N/A'}</TableCell>
                              <TableCell>{service.location || 'N/A'}</TableCell>
                              <TableCell>{service.usageBreakdown?.speech?.toFixed(2) || '0.00'} {service.currency || 'USD'}</TableCell>
                              <TableCell>{service.usageBreakdown?.translation?.toFixed(2) || '0.00'} {service.currency || 'USD'}</TableCell>
                              <TableCell>{service.usageBreakdown?.other?.toFixed(2) || '0.00'} {service.currency || 'USD'}</TableCell>
                              <TableCell><strong>{service.totalCost?.toFixed(2) || '0.00'} {service.currency || 'USD'}</strong></TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </TableContainer>
                  </AccordionDetails>
                </Accordion>
              )}
            </CardContent>
          </Card>
          </Box>
        </TabPanel>

        {/* 通知提示 */}
        <Snackbar
          open={snackbar.open}
          autoHideDuration={6000}
          onClose={() => setSnackbar({ ...snackbar, open: false })}
        >
          <Alert
            onClose={() => setSnackbar({ ...snackbar, open: false })}
            severity={snackbar.severity}
            sx={{ width: '100%' }}
          >
            {snackbar.message}
          </Alert>
        </Snackbar>
      </Box>
    </Layout>
  );
};

export default UploadPage;
