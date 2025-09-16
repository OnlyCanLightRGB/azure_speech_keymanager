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

} from '@mui/icons-material';
import Layout from '../components/Layout';
import { uploadApi } from '../utils/api';
import { 
  ResourceKeyCreationRequest, 
  ResourceKeyCreationResponse, 
  ResourceKeyCreationResult,
  ResourceKeyItem,
  ResourceCreationOptions
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



  const [creationOptions, setCreationOptions] = useState<ResourceCreationOptions>({
    overwrite: false,
    validateBeforeCreate: true,
    enableAfterCreate: true,
    setDefaultRegion: false
  });
  

  
  const [uploadResult, setUploadResult] = useState<ResourceKeyCreationResponse | null>(null);

  const [loading, setLoading] = useState(false);
  const [snackbar, setSnackbar] = useState({ open: false, message: '', severity: 'success' as 'success' | 'error' });
  

  


  const handleTabChange = (event: React.SyntheticEvent, newValue: number) => {
    setTabValue(newValue);
  };













  const showSnackbar = (message: string, severity: 'success' | 'error' = 'success') => {
    setSnackbar({ open: true, message, severity });
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
      const result = await uploadApi.createResources(selectedFile);
      setUploadResult(result);
      showSnackbar(result.message);
    } catch (error: any) {
      showSnackbar(`创建资源失败: ${error.message}`, 'error');
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
