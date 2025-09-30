import React, { useState, useEffect } from 'react';
import {
  Box,
  Button,
  Card,
  CardContent,

  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  TextField,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  Typography,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  IconButton,
  Tooltip,
  Alert,
  Snackbar,
  TablePagination,
  Checkbox,
  Menu,
  ListItemIcon,
  ListItemText,
} from '@mui/material';
import SafeChip from '../components/SafeChip';
import {
  Add as AddIcon,
  Edit as EditIcon,
  Delete as DeleteIcon,
  Stop as StopIcon,
  PlayArrow as PlayIcon,
  Science as TestIcon,
  Refresh as RefreshIcon,
  Translate as TranslateIcon,
  MoreVert as MoreVertIcon,
  GetApp as ExportIcon,
  SelectAll as SelectAllIcon,
  BugReport as ScriptIcon,
  CleaningServices as CleanupIcon,
  Security as FallbackIcon,
} from '@mui/icons-material';
import Layout from '../components/Layout';
import { translationApi, scriptsApi } from '../utils/api';
import { TranslationKey, KeyStatus, REGIONS, AddKeyForm, TestKeyForm, EditKeyForm } from '../types';
import dayjs from 'dayjs';

const TranslationPage: React.FC = () => {
  const [keys, setKeys] = useState<TranslationKey[]>([]);
  const [loading, setLoading] = useState(false);
  const [addModalVisible, setAddModalVisible] = useState(false);
  const [testModalVisible, setTestModalVisible] = useState(false);
  const [editModalVisible, setEditModalVisible] = useState(false);
  const [currentKey, setCurrentKey] = useState<TranslationKey | null>(null);
  const [snackbar, setSnackbar] = useState({ open: false, message: '', severity: 'success' as 'success' | 'error' });
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(10);
  const [selectedKeys, setSelectedKeys] = useState<string[]>([]);
  const [bulkMenuAnchor, setBulkMenuAnchor] = useState<null | HTMLElement>(null);
  
  // Script execution states
  const [scriptRunning, setScriptRunning] = useState(false);
  const [scriptResultModalVisible, setScriptResultModalVisible] = useState(false);
  const [scriptResult, setScriptResult] = useState<any>(null);

  // Form states
  const [addFormData, setAddFormData] = useState<AddKeyForm>({ key: '', region: '', keyname: '', priority_weight: 1 });
  const [testFormData, setTestFormData] = useState<TestKeyForm>({ key: '', region: '' });
  const [editFormData, setEditFormData] = useState<EditKeyForm>({ keyname: '', region: '' });

  // Load keys on component mount
  useEffect(() => {
    loadKeys();
  }, []);

  const showSnackbar = (message: string, severity: 'success' | 'error' = 'success') => {
    setSnackbar({ open: true, message, severity });
  };

  const loadKeys = async () => {
    setLoading(true);
    try {
      const data = await translationApi.getAllKeys();
      setKeys(data);
    } catch (error: any) {
      showSnackbar(`加载翻译密钥失败: ${error.message}`, 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleAddKey = async () => {
    try {
      await translationApi.addKey(addFormData);
      showSnackbar('翻译密钥添加成功');
      setAddModalVisible(false);
      setAddFormData({ key: '', region: '', keyname: '' });
      loadKeys();
    } catch (error: any) {
      showSnackbar(`添加翻译密钥失败: ${error.message}`, 'error');
    }
  };

  const handleToggleFallback = async (key: TranslationKey) => {
    try {
      const newIsFallback = key.priority_weight !== 0;
      await translationApi.setFallback(key.key, newIsFallback);
      showSnackbar(`翻译密钥已${newIsFallback ? '设为保底' : '设为普通'}密钥`);
      loadKeys();
    } catch (error: any) {
      showSnackbar(`切换翻译密钥类型失败: ${error.message}`, 'error');
    }
  };

  const handleDeleteKey = async (key: string) => {
    try {
      await translationApi.deleteKey(key);
      showSnackbar('翻译密钥删除成功');
      loadKeys();
    } catch (error: any) {
      showSnackbar(`删除翻译密钥失败: ${error.message}`, 'error');
    }
  };

  const handleDisableKey = async (key: string) => {
    try {
      await translationApi.disableKey(key);
      showSnackbar('翻译密钥禁用成功');
      loadKeys();
    } catch (error: any) {
      showSnackbar(`禁用翻译密钥失败: ${error.message}`, 'error');
    }
  };

  const handleEnableKey = async (key: string) => {
    try {
      await translationApi.enableKey(key);
      showSnackbar('翻译密钥启用成功');
      loadKeys();
    } catch (error: any) {
      showSnackbar(`启用翻译密钥失败: ${error.message}`, 'error');
    }
  };

  const handleTestKey = async () => {
    try {
      const result = await translationApi.testKey(testFormData);
      if (result.statusCode === 200) {
        const translatedText = result.translatedText || '翻译结果未知';
        showSnackbar(`翻译密钥测试成功！翻译结果: ${translatedText}`);
      } else {
        showSnackbar(`翻译密钥测试失败: ${result.error || '未知错误'}`, 'error');
      }
      setTestModalVisible(false);
      setTestFormData({ key: '', region: '' });
      loadKeys();
    } catch (error: any) {
      showSnackbar(`测试翻译密钥失败: ${error.message}`, 'error');
    }
  };

  const openTestModal = (key: TranslationKey) => {
    setCurrentKey(key);
    setTestFormData({
      key: key.key,
      region: key.region
    });
    setTestModalVisible(true);
  };

  const openEditModal = (key: TranslationKey) => {
    setCurrentKey(key);
    setEditFormData({
      keyname: key.keyname,
      region: key.region
    });
    setEditModalVisible(true);
  };

  const handleEditKey = async () => {
    if (!currentKey) return;

    try {
      await translationApi.updateKey(currentKey.key, editFormData.keyname, editFormData.region);
      showSnackbar('翻译密钥更新成功');
      setEditModalVisible(false);
      setEditFormData({ keyname: '', region: '' });
      setCurrentKey(null);
      loadKeys();
    } catch (error: any) {
      showSnackbar(`更新翻译密钥失败: ${error.message}`, 'error');
    }
  };

  // Calculate statistics
  const stats = {
    total: keys.length,
    enabled: keys.filter(k => k.status === KeyStatus.ENABLED).length,
    disabled: keys.filter(k => k.status === KeyStatus.DISABLED).length,
    cooldown: keys.filter(k => k.status === KeyStatus.COOLDOWN).length,
    totalUsage: keys.reduce((sum, k) => sum + (k.usage_count || 0), 0),
    totalErrors: keys.reduce((sum, k) => sum + (k.error_count || 0), 0),
    successRate: keys.reduce((sum, k) => sum + (k.usage_count || 0), 0) > 0
      ? ((keys.reduce((sum, k) => sum + (k.usage_count || 0), 0) - keys.reduce((sum, k) => sum + (k.error_count || 0), 0)) / keys.reduce((sum, k) => sum + (k.usage_count || 0), 0) * 100).toFixed(1)
      : '100.0'
  };

  const handleChangePage = (event: unknown, newPage: number) => {
    setPage(newPage);
  };

  const handleChangeRowsPerPage = (event: React.ChangeEvent<HTMLInputElement>) => {
    setRowsPerPage(parseInt(event.target.value, 10));
    setPage(0);
  };

  // Bulk operations
  const handleSelectAll = () => {
    if (selectedKeys.length === keys.length) {
      setSelectedKeys([]);
    } else {
      setSelectedKeys(keys.map(k => k.key));
    }
  };

  const handleSelectKey = (key: string) => {
    setSelectedKeys(prev =>
      prev.includes(key)
        ? prev.filter(k => k !== key)
        : [...prev, key]
    );
  };

  const handleBulkAction = async (action: 'enable' | 'disable' | 'delete') => {
    if (selectedKeys.length === 0) return;

    try {
      const promises = selectedKeys.map(key => {
        switch (action) {
          case 'enable': return translationApi.enableKey(key);
          case 'disable': return translationApi.disableKey(key);
          case 'delete': return translationApi.deleteKey(key);
          default: return Promise.resolve();
        }
      });

      await Promise.all(promises);
      const actionText = action === 'enable' ? '启用' : action === 'disable' ? '禁用' : '删除';
      showSnackbar(`成功${actionText}了 ${selectedKeys.length} 个翻译密钥`);
      setSelectedKeys([]);
      setBulkMenuAnchor(null);
      loadKeys();
    } catch (error: any) {
      const actionText = action === 'enable' ? '启用' : action === 'disable' ? '禁用' : '删除';
      showSnackbar(`批量${actionText}翻译密钥失败: ${error.message}`, 'error');
    }
  };

  // Script execution functions
  const handleRunCooldownTest = async () => {
    setScriptRunning(true);
    try {
      const result = await scriptsApi.runCooldownTest('translation');
      setScriptResult({
        type: 'cooldown-test',
        title: '翻译密钥冷却测试',
        ...result
      });
      setScriptResultModalVisible(true);
      showSnackbar('翻译密钥冷却测试执行成功');
      // 刷新密钥列表以查看可能的状态变化
      loadKeys();
    } catch (error: any) {
      showSnackbar(`执行翻译密钥冷却测试失败: ${error.message}`, 'error');
    } finally {
      setScriptRunning(false);
    }
  };

  const handleRunCleanup = async () => {
    setScriptRunning(true);
    try {
      const result = await scriptsApi.runCleanup();
      setScriptResult({
        type: 'cleanup',
        title: '系统清理',
        ...result
      });
      setScriptResultModalVisible(true);
      showSnackbar('系统清理执行成功');
      // 刷新密钥列表以查看可能的变化
      loadKeys();
    } catch (error: any) {
      showSnackbar(`执行系统清理失败: ${error.message}`, 'error');
    } finally {
      setScriptRunning(false);
    }
  };

  const exportKeys = () => {
    const maskKey = (key: string) => {
      if (key.length <= 16) return key;
      return `${key.substring(0, 8)}...${key.substring(key.length - 4)}`;
    };

    const csvContent = [
      ['ID', '密钥名称', '密钥', '区域', '状态', '使用次数', '错误次数', '最后使用', '创建时间', '更新时间'],
      ...keys.map(key => [
        key.id,
        key.keyname,
        maskKey(key.key),
        key.region,
        key.status,
        key.usage_count || 0,
        key.error_count || 0,
        key.last_used ? dayjs(key.last_used).format('YYYY-MM-DD HH:mm:ss') : '从未使用',
        key.created_at ? dayjs(key.created_at).format('YYYY-MM-DD HH:mm:ss') : '无',
        key.updated_at ? dayjs(key.updated_at).format('YYYY-MM-DD HH:mm:ss') : '无'
      ])
    ].map(row => row.join(',')).join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `translation-keys-${dayjs().format('YYYY-MM-DD-HH-mm-ss')}.csv`;
    a.click();
    window.URL.revokeObjectURL(url);
  };

  const getStatusColor = (status: KeyStatus) => {
    switch (status) {
      case KeyStatus.ENABLED:
        return 'success';
      case KeyStatus.DISABLED:
        return 'error';
      case KeyStatus.COOLDOWN:
        return 'warning';
      default:
        return 'default';
    }
  };

  const getStatusText = (status: KeyStatus) => {
    switch (status) {
      case KeyStatus.ENABLED:
        return '已启用';
      case KeyStatus.DISABLED:
        return '已禁用';
      case KeyStatus.COOLDOWN:
        return '冷却中';
      default:
        return '未知';
    }
  };

  return (
    <Layout>
      <Box>
        <Box sx={{ mb: 3 }}>
          <Typography variant="h4" component="h1" sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 3 }}>
            <TranslateIcon /> 翻译密钥管理
          </Typography>

          {/* Statistics Cards */}
          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 2, mb: 3 }}>
            <Card sx={{ flex: '1 1 200px' }}>
              <CardContent>
                <Typography variant="h6">{stats.total}</Typography>
                <Typography variant="body2" color="text.secondary">总密钥数</Typography>
              </CardContent>
            </Card>
            <Card sx={{ flex: '1 1 200px' }}>
              <CardContent>
                <Typography variant="h6" sx={{ color: 'success.main' }}>{stats.enabled}</Typography>
                <Typography variant="body2" color="text.secondary">已启用</Typography>
              </CardContent>
            </Card>
            <Card sx={{ flex: '1 1 200px' }}>
              <CardContent>
                <Typography variant="h6" sx={{ color: 'error.main' }}>{stats.disabled}</Typography>
                <Typography variant="body2" color="text.secondary">已禁用</Typography>
              </CardContent>
            </Card>
            <Card sx={{ flex: '1 1 200px' }}>
              <CardContent>
                <Typography variant="h6" sx={{ color: 'warning.main' }}>{stats.cooldown}</Typography>
                <Typography variant="body2" color="text.secondary">冷却中</Typography>
              </CardContent>
            </Card>
            <Card sx={{ flex: '1 1 200px' }}>
              <CardContent>
                <Typography variant="h6">{stats.totalUsage}</Typography>
                <Typography variant="body2" color="text.secondary">总使用次数</Typography>
              </CardContent>
            </Card>
            <Card sx={{ flex: '1 1 200px' }}>
              <CardContent>
                <Typography variant="h6" sx={{ color: stats.totalErrors > 0 ? 'error.main' : 'success.main' }}>
                  {stats.totalErrors}
                </Typography>
                <Typography variant="body2" color="text.secondary">总错误次数</Typography>
              </CardContent>
            </Card>
            <Card sx={{ flex: '1 1 200px' }}>
              <CardContent>
                <Typography variant="h6" sx={{ color: 'primary.main' }}>
                  {stats.successRate}%
                </Typography>
                <Typography variant="body2" color="text.secondary">成功率</Typography>
              </CardContent>
            </Card>
          </Box>

          <Box sx={{ display: 'flex', gap: 2, mb: 3, alignItems: 'center', flexWrap: 'wrap' }}>
            <Button
              variant="contained"
              startIcon={<AddIcon />}
              onClick={() => setAddModalVisible(true)}
            >
              添加翻译密钥
            </Button>
            <Button
              startIcon={<RefreshIcon />}
              onClick={loadKeys}
              disabled={loading}
            >
              刷新
            </Button>
            <Button
              startIcon={<ExportIcon />}
              onClick={exportKeys}
              disabled={keys.length === 0}
              variant="outlined"
            >
              导出CSV
            </Button>
            <Button
              startIcon={<ScriptIcon />}
              onClick={handleRunCooldownTest}
              variant="outlined"
              color="secondary"
              disabled={scriptRunning}
            >
              {scriptRunning ? '执行中...' : '冷却测试'}
            </Button>
            <Button
              startIcon={<CleanupIcon />}
              onClick={handleRunCleanup}
              variant="outlined"
              color="warning"
              disabled={scriptRunning}
            >
              {scriptRunning ? '执行中...' : '系统清理'}
            </Button>
            {selectedKeys.length > 0 && (
              <>
                <Typography variant="body2" color="text.secondary">
                  已选择 {selectedKeys.length} 个
                </Typography>
                <Button
                  startIcon={<MoreVertIcon />}
                  onClick={(e) => setBulkMenuAnchor(e.currentTarget)}
                  variant="outlined"
                  color="primary"
                >
                  批量操作
                </Button>
              </>
            )}
          </Box>
        </Box>

        {/* Keys Table */}
        <Paper>
          <TableContainer>
            <Table>
              <TableHead>
                <TableRow>
                  <TableCell padding="checkbox">
                    <Checkbox
                      indeterminate={selectedKeys.length > 0 && selectedKeys.length < keys.length}
                      checked={keys.length > 0 && selectedKeys.length === keys.length}
                      onChange={handleSelectAll}
                    />
                  </TableCell>
                  <TableCell>ID</TableCell>
                  <TableCell>密钥名称</TableCell>
                  <TableCell>密钥</TableCell>
                  <TableCell>区域</TableCell>
                  <TableCell>类型</TableCell>
                  <TableCell>状态</TableCell>
                  <TableCell>使用次数</TableCell>
                  <TableCell>错误次数</TableCell>
                  <TableCell>最后使用</TableCell>
                  <TableCell>创建时间</TableCell>
                  <TableCell>更新时间</TableCell>
                  <TableCell>操作</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {keys
                  .slice(page * rowsPerPage, page * rowsPerPage + rowsPerPage)
                  .map((key) => (
                    <TableRow key={key.id} selected={selectedKeys.includes(key.key)}>
                      <TableCell padding="checkbox">
                        <Checkbox
                          checked={selectedKeys.includes(key.key)}
                          onChange={() => handleSelectKey(key.key)}
                        />
                      </TableCell>
                      <TableCell>
                        <Typography variant="body2" color="text.secondary">#{key.id}</Typography>
                      </TableCell>
                      <TableCell><strong>{key.keyname}</strong></TableCell>
                      <TableCell>
                        <Typography variant="body2" component="code" sx={{ fontSize: '12px', wordBreak: 'break-all' }}>
                          {key.key.length > 16 ? `${key.key.substring(0, 8)}...${key.key.substring(key.key.length - 4)}` : key.key}
                        </Typography>
                      </TableCell>
                      <TableCell>
                        <SafeChip label={key.region} size="small" color="primary" />
                      </TableCell>
                      <TableCell>
                        <SafeChip
                          label={(key.priority_weight === 0) ? '保底' : '普通'}
                          size="small"
                          color={(key.priority_weight === 0) ? 'warning' : 'info'}
                        />
                      </TableCell>
                      <TableCell>
                        <SafeChip
                          label={key.status.toUpperCase()}
                          size="small"
                          color={
                            key.status === 'enabled' ? 'success' :
                            key.status === 'disabled' ? 'error' :
                            key.status === 'cooldown' ? 'warning' :
                            'default'
                          }
                        />
                      </TableCell>
                      <TableCell>{key.usage_count || 0}</TableCell>
                      <TableCell>{key.error_count || 0}</TableCell>
                      <TableCell>
                        {key.last_used ? dayjs(key.last_used).format('YYYY-MM-DD HH:mm:ss') : '从未使用'}
                      </TableCell>
                      <TableCell>
                        {key.created_at ? dayjs(key.created_at).format('YYYY-MM-DD HH:mm:ss') : '无'}
                      </TableCell>
                      <TableCell>
                        {key.updated_at ? dayjs(key.updated_at).format('YYYY-MM-DD HH:mm:ss') : '无'}
                      </TableCell>
                      <TableCell>
                        <Box sx={{ display: 'flex', gap: 1 }}>
                          <Tooltip title="测试密钥">
                            <IconButton
                              size="small"
                              onClick={() => openTestModal(key)}
                              color="primary"
                            >
                              <TestIcon />
                            </IconButton>
                          </Tooltip>
                          <Tooltip title="编辑密钥">
                            <IconButton
                              size="small"
                              onClick={() => openEditModal(key)}
                              color="primary"
                            >
                              <EditIcon />
                            </IconButton>
                          </Tooltip>
                          {key.status === KeyStatus.ENABLED ? (
                            <Tooltip title="禁用密钥">
                              <IconButton
                                size="small"
                                onClick={() => handleDisableKey(key.key)}
                                color="warning"
                              >
                                <StopIcon />
                              </IconButton>
                            </Tooltip>
                          ) : (
                            <Tooltip title="启用密钥">
                              <IconButton
                                size="small"
                                onClick={() => handleEnableKey(key.key)}
                                color="success"
                              >
                                <PlayIcon />
                              </IconButton>
                            </Tooltip>
                          )}
                          <Tooltip title={key.priority_weight === 0 ? "设为普通密钥" : "设为保底密钥"}>
                            <IconButton
                              size="small"
                              color={key.priority_weight === 0 ? "warning" : "default"}
                              onClick={() => handleToggleFallback(key)}
                            >
                              <FallbackIcon />
                            </IconButton>
                          </Tooltip>
                          <Tooltip title="删除密钥">
                            <IconButton
                              size="small"
                              onClick={() => handleDeleteKey(key.key)}
                              color="error"
                            >
                              <DeleteIcon />
                            </IconButton>
                          </Tooltip>
                        </Box>
                      </TableCell>
                    </TableRow>
                  ))}
              </TableBody>
            </Table>
          </TableContainer>
          <TablePagination
            rowsPerPageOptions={[5, 10, 25, 50]}
            component="div"
            count={keys.length}
            rowsPerPage={rowsPerPage}
            page={page}
            onPageChange={handleChangePage}
            onRowsPerPageChange={handleChangeRowsPerPage}
            labelRowsPerPage="每页行数:"
            labelDisplayedRows={({ from, to, count }) => `${from}-${to} 共 ${count} 条`}
          />
        </Paper>

        {/* Add Key Dialog */}
        <Dialog open={addModalVisible} onClose={() => setAddModalVisible(false)} maxWidth="sm" fullWidth>
          <DialogTitle>添加翻译密钥</DialogTitle>
          <DialogContent>
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: 1 }}>
              <TextField
                label="密钥名称"
                value={addFormData.keyname}
                onChange={(e) => setAddFormData({ ...addFormData, keyname: e.target.value })}
                fullWidth
                required
              />
              <TextField
                label="密钥"
                value={addFormData.key}
                onChange={(e) => setAddFormData({ ...addFormData, key: e.target.value })}
                fullWidth
                required
                multiline
                rows={3}
              />
              <FormControl fullWidth>
                <InputLabel>区域</InputLabel>
                <Select
                  value={addFormData.region}
                  onChange={(e) => setAddFormData({ ...addFormData, region: e.target.value })}
                  label="区域"
                >
                  {REGIONS.map((region) => (
                    <MenuItem key={region} value={region}>
                      {region}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
              <Box sx={{ display: 'flex', alignItems: 'center' }}>
                <Checkbox
                  checked={addFormData.priority_weight === 0}
                  onChange={(e) => setAddFormData({
                    ...addFormData,
                    priority_weight: e.target.checked ? 0 : 1
                  })}
                />
                <Typography variant="body2" sx={{ ml: 1 }}>
                  设置为保底密钥（仅在所有普通密钥冷却时使用）
                </Typography>
              </Box>
            </Box>
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setAddModalVisible(false)}>取消</Button>
            <Button
              onClick={handleAddKey}
              variant="contained"
              disabled={!addFormData.key || !addFormData.keyname}
            >
              添加
            </Button>
          </DialogActions>
        </Dialog>

        {/* Test Key Dialog */}
        <Dialog open={testModalVisible} onClose={() => setTestModalVisible(false)} maxWidth="sm" fullWidth>
          <DialogTitle>测试翻译密钥</DialogTitle>
          <DialogContent>
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: 1 }}>
              <TextField
                label="密钥"
                value={testFormData.key}
                onChange={(e) => setTestFormData({ ...testFormData, key: e.target.value })}
                fullWidth
                required
                multiline
                rows={3}
              />
              <FormControl fullWidth>
                <InputLabel>区域</InputLabel>
                <Select
                  value={testFormData.region}
                  onChange={(e) => setTestFormData({ ...testFormData, region: e.target.value })}
                  label="区域"
                >
                  {REGIONS.map((region) => (
                    <MenuItem key={region} value={region}>
                      {region}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Box>
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setTestModalVisible(false)}>取消</Button>
            <Button
              onClick={handleTestKey}
              variant="contained"
              disabled={!testFormData.key || !testFormData.region}
            >
              测试
            </Button>
          </DialogActions>
        </Dialog>

        {/* Edit Key Dialog */}
        <Dialog open={editModalVisible} onClose={() => setEditModalVisible(false)} maxWidth="sm" fullWidth>
          <DialogTitle>编辑翻译密钥</DialogTitle>
          <DialogContent>
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: 1 }}>
              <TextField
                label="密钥名称"
                value={editFormData.keyname}
                onChange={(e) => setEditFormData({ ...editFormData, keyname: e.target.value })}
                fullWidth
                required
              />
              <FormControl fullWidth required>
                <InputLabel>区域</InputLabel>
                <Select
                  value={editFormData.region}
                  onChange={(e) => setEditFormData({ ...editFormData, region: e.target.value })}
                  label="区域"
                  required
                >
                  {REGIONS.map((region) => (
                    <MenuItem key={region} value={region}>
                      {region}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Box>
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setEditModalVisible(false)}>取消</Button>
            <Button
              onClick={handleEditKey}
              variant="contained"
              disabled={!editFormData.keyname || !editFormData.region}
            >
              更新
            </Button>
          </DialogActions>
        </Dialog>

        {/* Script Result Dialog */}
        <Dialog 
          open={scriptResultModalVisible} 
          onClose={() => setScriptResultModalVisible(false)} 
          maxWidth="md" 
          fullWidth
        >
          <DialogTitle>
            {scriptResult?.title || '脚本执行结果'}
          </DialogTitle>
          <DialogContent>
            <Box sx={{ pt: 1 }}>
              {scriptResult && (
                <>
                  <Typography variant="h6" gutterBottom>
                    执行状态: {scriptResult.exitCode === 0 ? '成功' : '失败'}
                  </Typography>
                  <Typography variant="body2" color="text.secondary" gutterBottom>
                    执行时间: {scriptResult.timestamp ? new Date(scriptResult.timestamp).toLocaleString() : '未知'}
                  </Typography>
                  
                  {scriptResult.output && (
                    <Box sx={{ mt: 2 }}>
                      <Typography variant="subtitle2" gutterBottom>
                        输出信息:
                      </Typography>
                      <Paper sx={{ p: 2, bgcolor: 'grey.100', maxHeight: 300, overflow: 'auto' }}>
                        <Typography variant="body2" component="pre" sx={{ whiteSpace: 'pre-wrap', fontFamily: 'monospace' }}>
                          {scriptResult.output}
                        </Typography>
                      </Paper>
                    </Box>
                  )}
                  
                  {scriptResult.error && (
                    <Box sx={{ mt: 2 }}>
                      <Typography variant="subtitle2" gutterBottom color="error">
                        错误信息:
                      </Typography>
                      <Paper sx={{ p: 2, bgcolor: 'error.light', maxHeight: 200, overflow: 'auto' }}>
                        <Typography variant="body2" component="pre" sx={{ whiteSpace: 'pre-wrap', fontFamily: 'monospace', color: 'error.contrastText' }}>
                          {scriptResult.error}
                        </Typography>
                      </Paper>
                    </Box>
                  )}
                </>
              )}
            </Box>
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setScriptResultModalVisible(false)}>
              关闭
            </Button>
          </DialogActions>
        </Dialog>

        {/* Bulk Actions Menu */}
        <Menu
          anchorEl={bulkMenuAnchor}
          open={Boolean(bulkMenuAnchor)}
          onClose={() => setBulkMenuAnchor(null)}
        >
          <MenuItem onClick={() => handleBulkAction('enable')}>
            <ListItemIcon>
              <PlayIcon fontSize="small" />
            </ListItemIcon>
            <ListItemText>启用选中项</ListItemText>
          </MenuItem>
          <MenuItem onClick={() => handleBulkAction('disable')}>
            <ListItemIcon>
              <StopIcon fontSize="small" />
            </ListItemIcon>
            <ListItemText>禁用选中项</ListItemText>
          </MenuItem>
          <MenuItem onClick={() => handleBulkAction('delete')}>
            <ListItemIcon>
              <DeleteIcon fontSize="small" />
            </ListItemIcon>
            <ListItemText>删除选中项</ListItemText>
          </MenuItem>
        </Menu>

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

export default TranslationPage;