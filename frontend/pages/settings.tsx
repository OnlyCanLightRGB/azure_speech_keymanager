import React, { useState, useEffect } from 'react';
import {
  Box,
  Card,
  CardContent,
  TextField,
  Button,
  Typography,
  Divider,
  Alert,
  Snackbar,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  Tooltip,
  TablePagination,
} from '@mui/material';
import {
  Settings as SettingsIcon,
  Save as SaveIcon,
  Add as AddIcon,
  Edit as EditIcon,
  Delete as DeleteIcon,
  Refresh as RefreshIcon,
} from '@mui/icons-material';
import Layout from '../components/Layout';
import { configApi } from '../utils/api';
import { SystemConfig } from '../types';

const SettingsPage: React.FC = () => {
  const [configs, setConfigs] = useState<SystemConfig[]>([]);
  const [loading, setLoading] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);
  const [editingConfig, setEditingConfig] = useState<SystemConfig | null>(null);
  const [snackbar, setSnackbar] = useState({ open: false, message: '', severity: 'success' as 'success' | 'error' });
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(10);

  // Form states
  const [quickSettings, setQuickSettings] = useState({
    cooldown_seconds: 300,
    disable_codes: '401,404',
    cooldown_codes: '429',
    max_concurrent_requests: 10
  });

  const [configFormData, setConfigFormData] = useState({
    config_key: '',
    config_value: '',
    description: ''
  });

  const showSnackbar = (message: string, severity: 'success' | 'error' = 'success') => {
    setSnackbar({ open: true, message, severity });
  };

  useEffect(() => {
    loadConfigs();
  }, []);

  const loadConfigs = async () => {
    setLoading(true);
    try {
      const data = await configApi.getAllConfigs();
      setConfigs(data);

      // Set form values for quick settings
      const configMap = data.reduce((acc, config) => {
        acc[config.config_key] = config.config_value;
        return acc;
      }, {} as Record<string, string>);

      setQuickSettings({
        cooldown_seconds: parseInt(configMap.cooldown_seconds || '300'),
        disable_codes: configMap.disable_codes || '401,404',
        cooldown_codes: configMap.cooldown_codes || '429',
        max_concurrent_requests: parseInt(configMap.max_concurrent_requests || '10')
      });
    } catch (error: any) {
      showSnackbar(`Failed to load configurations: ${error.message}`, 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleQuickSave = async () => {
    try {
      const configsToUpdate: SystemConfig[] = [
        {
          config_key: 'cooldown_seconds',
          config_value: quickSettings.cooldown_seconds.toString(),
          description: 'Default cooldown time in seconds'
        },
        {
          config_key: 'disable_codes',
          config_value: quickSettings.disable_codes,
          description: 'Status codes that trigger key disable'
        },
        {
          config_key: 'cooldown_codes',
          config_value: quickSettings.cooldown_codes,
          description: 'Status codes that trigger cooldown'
        },
        {
          config_key: 'max_concurrent_requests',
          config_value: quickSettings.max_concurrent_requests.toString(),
          description: 'Maximum concurrent requests'
        }
      ];

      await configApi.batchUpdateConfigs(configsToUpdate);
      showSnackbar('Settings saved successfully');
      loadConfigs();
    } catch (error: any) {
      showSnackbar(`Failed to save settings: ${error.message}`, 'error');
    }
  };

  const handleConfigSave = async () => {
    try {
      if (editingConfig) {
        await configApi.updateConfig(editingConfig.config_key, configFormData.config_value, configFormData.description);
        showSnackbar('Configuration updated successfully');
      } else {
        await configApi.saveConfig(configFormData);
        showSnackbar('Configuration created successfully');
      }

      setModalVisible(false);
      setEditingConfig(null);
      setConfigFormData({ config_key: '', config_value: '', description: '' });
      loadConfigs();
    } catch (error: any) {
      showSnackbar(`Failed to save configuration: ${error.message}`, 'error');
    }
  };

  const handleConfigDelete = async (key: string) => {
    try {
      await configApi.deleteConfig(key);
      showSnackbar('Configuration deleted successfully');
      loadConfigs();
    } catch (error: any) {
      showSnackbar(`Failed to delete configuration: ${error.message}`, 'error');
    }
  };

  const openConfigModal = (config?: SystemConfig) => {
    if (config) {
      setEditingConfig(config);
      setConfigFormData({
        config_key: config.config_key,
        config_value: config.config_value,
        description: config.description || ''
      });
    } else {
      setEditingConfig(null);
      setConfigFormData({ config_key: '', config_value: '', description: '' });
    }
    setModalVisible(true);
  };

  const handleChangePage = (event: unknown, newPage: number) => {
    setPage(newPage);
  };

  const handleChangeRowsPerPage = (event: React.ChangeEvent<HTMLInputElement>) => {
    setRowsPerPage(parseInt(event.target.value, 10));
    setPage(0);
  };



  return (
    <Layout>
      <Box>
        <Typography variant="h4" component="h1" sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 3 }}>
          <SettingsIcon /> 系统设置
        </Typography>

        <Box sx={{ display: 'flex', gap: 3, mb: 3, flexWrap: 'wrap' }}>
          <Card sx={{ flex: 1, minWidth: '400px' }}>
            <CardContent>
              <Typography variant="h6" gutterBottom>快速设置</Typography>
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                <TextField
                  type="number"
                  label="冷却时长 (秒)"
                  value={quickSettings.cooldown_seconds}
                  onChange={(e) => setQuickSettings(prev => ({ ...prev, cooldown_seconds: parseInt(e.target.value) || 300 }))}
                  slotProps={{ htmlInput: { min: 1, max: 3600 } }}
                  placeholder="默认: 300"
                  fullWidth
                />

                <TextField
                  label="禁用状态码"
                  value={quickSettings.disable_codes}
                  onChange={(e) => setQuickSettings(prev => ({ ...prev, disable_codes: e.target.value }))}
                  placeholder="401,404"
                  fullWidth
                />

                <TextField
                  label="冷却状态码"
                  value={quickSettings.cooldown_codes}
                  onChange={(e) => setQuickSettings(prev => ({ ...prev, cooldown_codes: e.target.value }))}
                  placeholder="429"
                  fullWidth
                />

                <TextField
                  type="number"
                  label="最大并发请求数"
                  value={quickSettings.max_concurrent_requests}
                  onChange={(e) => setQuickSettings(prev => ({ ...prev, max_concurrent_requests: parseInt(e.target.value) || 10 }))}
                  slotProps={{ htmlInput: { min: 1, max: 100 } }}
                  placeholder="默认: 10"
                  fullWidth
                />

                <Button
                  variant="contained"
                  startIcon={<SaveIcon />}
                  onClick={handleQuickSave}
                  sx={{ mt: 2 }}
                >
                  保存设置
                </Button>
              </Box>
            </CardContent>
          </Card>

          <Card sx={{ flex: 1, minWidth: '400px' }}>
            <CardContent>
              <Typography variant="h6" gutterBottom>数据库配置</Typography>
              <Typography variant="body2" sx={{ mb: 2 }}>
                数据库配置通过环境变量管理：
              </Typography>
              <Box sx={{ mt: 2 }}>
                <Typography variant="body2" component="div">
                  <Typography component="code" sx={{ bgcolor: 'grey.100', p: 0.5, borderRadius: 1 }}>DB_HOST</Typography> - 数据库主机<br />
                  <Typography component="code" sx={{ bgcolor: 'grey.100', p: 0.5, borderRadius: 1 }}>DB_PORT</Typography> - 数据库端口<br />
                  <Typography component="code" sx={{ bgcolor: 'grey.100', p: 0.5, borderRadius: 1 }}>DB_USER</Typography> - 数据库用户名<br />
                  <Typography component="code" sx={{ bgcolor: 'grey.100', p: 0.5, borderRadius: 1 }}>DB_PASSWORD</Typography> - 数据库密码<br />
                  <Typography component="code" sx={{ bgcolor: 'grey.100', p: 0.5, borderRadius: 1 }}>DB_NAME</Typography> - 数据库名称<br />
                </Typography>
              </Box>
              <Typography variant="body2" color="text.secondary" sx={{ mt: 2 }}>
                更改数据库配置后需要重启应用程序。
              </Typography>
            </CardContent>
          </Card>
        </Box>

        <Divider sx={{ my: 3 }} />

        {/* All Configurations */}
        <Card>
          <CardContent>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
              <Typography variant="h6">所有配置</Typography>
              <Box sx={{ display: 'flex', gap: 1 }}>
                <Button
                  variant="contained"
                  startIcon={<AddIcon />}
                  onClick={() => openConfigModal()}
                >
                  添加配置
                </Button>
                <Button
                  startIcon={<RefreshIcon />}
                  onClick={loadConfigs}
                  disabled={loading}
                >
                  刷新
                </Button>
              </Box>
            </Box>

            <TableContainer component={Paper}>
              <Table>
                <TableHead>
                  <TableRow>
                    <TableCell>键</TableCell>
                    <TableCell>值</TableCell>
                    <TableCell>描述</TableCell>
                    <TableCell>更新时间</TableCell>
                    <TableCell>操作</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {configs.slice(page * rowsPerPage, page * rowsPerPage + rowsPerPage).map((config) => (
                    <TableRow key={config.config_key}>
                      <TableCell>
                        <Typography variant="body2" component="code" sx={{ bgcolor: 'grey.100', p: 0.5, borderRadius: 1 }}>
                          {config.config_key}
                        </Typography>
                      </TableCell>
                      <TableCell sx={{ maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {config.config_value}
                      </TableCell>
                      <TableCell sx={{ maxWidth: 300, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {config.description || 'N/A'}
                      </TableCell>
                      <TableCell>
                        {config.updated_at ? new Date(config.updated_at).toLocaleString() : 'N/A'}
                      </TableCell>
                      <TableCell>
                        <Box sx={{ display: 'flex', gap: 1 }}>
                          <Tooltip title="Edit">
                            <IconButton size="small" onClick={() => openConfigModal(config)}>
                              <EditIcon />
                            </IconButton>
                          </Tooltip>
                          <Tooltip title="Delete">
                            <IconButton size="small" color="error" onClick={() => handleConfigDelete(config.config_key)}>
                              <DeleteIcon />
                            </IconButton>
                          </Tooltip>
                        </Box>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              <TablePagination
                rowsPerPageOptions={[5, 10, 25]}
                component="div"
                count={configs.length}
                rowsPerPage={rowsPerPage}
                page={page}
                onPageChange={handleChangePage}
                onRowsPerPageChange={handleChangeRowsPerPage}
              />
            </TableContainer>
          </CardContent>
        </Card>

        {/* Configuration Dialog */}
        <Dialog open={modalVisible} onClose={() => setModalVisible(false)} maxWidth="sm" fullWidth>
          <DialogTitle>{editingConfig ? 'Edit Configuration' : 'Add Configuration'}</DialogTitle>
          <DialogContent>
            <Box sx={{ pt: 1 }}>
              <TextField
                fullWidth
                label="Configuration Key"
                value={configFormData.config_key}
                onChange={(e) => setConfigFormData(prev => ({ ...prev, config_key: e.target.value }))}
                placeholder="e.g., custom_setting"
                disabled={!!editingConfig}
                margin="normal"
                required
              />

              <TextField
                fullWidth
                multiline
                rows={3}
                label="Configuration Value"
                value={configFormData.config_value}
                onChange={(e) => setConfigFormData(prev => ({ ...prev, config_value: e.target.value }))}
                placeholder="Configuration value"
                margin="normal"
                required
              />

              <TextField
                fullWidth
                multiline
                rows={2}
                label="Description"
                value={configFormData.description}
                onChange={(e) => setConfigFormData(prev => ({ ...prev, description: e.target.value }))}
                placeholder="Optional description"
                margin="normal"
              />
            </Box>
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setModalVisible(false)}>Cancel</Button>
            <Button
              variant="contained"
              onClick={handleConfigSave}
              disabled={!configFormData.config_key || !configFormData.config_value}
            >
              {editingConfig ? 'Update' : 'Create'}
            </Button>
          </DialogActions>
        </Dialog>

        {/* Snackbar for notifications */}
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

export default SettingsPage;
