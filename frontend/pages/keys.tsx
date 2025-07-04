import React, { useState, useEffect } from 'react';
import {
  Box,
  Button,
  Card,
  CardContent,
  Chip,
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
import {
  Add as AddIcon,
  Edit as EditIcon,
  Delete as DeleteIcon,
  Stop as StopIcon,
  PlayArrow as PlayIcon,
  Science as TestIcon,
  Refresh as RefreshIcon,
  VpnKey as KeyIcon,
  MoreVert as MoreVertIcon,
  GetApp as ExportIcon,
  SelectAll as SelectAllIcon,
} from '@mui/icons-material';
import Layout from '../components/Layout';
import { keyApi } from '../utils/api';
import { AzureKey, KeyStatus, REGIONS, AddKeyForm, TestKeyForm, EditKeyForm } from '../types';
import dayjs from 'dayjs';

const KeysPage: React.FC = () => {
  const [keys, setKeys] = useState<AzureKey[]>([]);
  const [loading, setLoading] = useState(false);
  const [addModalVisible, setAddModalVisible] = useState(false);
  const [testModalVisible, setTestModalVisible] = useState(false);
  const [editModalVisible, setEditModalVisible] = useState(false);
  const [currentKey, setCurrentKey] = useState<AzureKey | null>(null);
  const [snackbar, setSnackbar] = useState({ open: false, message: '', severity: 'success' as 'success' | 'error' });
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(10);
  const [selectedKeys, setSelectedKeys] = useState<string[]>([]);
  const [bulkMenuAnchor, setBulkMenuAnchor] = useState<null | HTMLElement>(null);

  // Form states
  const [addFormData, setAddFormData] = useState<AddKeyForm>({ key: '', region: '', keyname: '' });
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
      const data = await keyApi.getAllKeys();
      setKeys(data);
    } catch (error: any) {
      showSnackbar(`加载密钥失败: ${error.message}`, 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleAddKey = async () => {
    try {
      await keyApi.addKey(addFormData);
      showSnackbar('密钥添加成功');
      setAddModalVisible(false);
      setAddFormData({ key: '', region: '', keyname: '' });
      loadKeys();
    } catch (error: any) {
      showSnackbar(`添加密钥失败: ${error.message}`, 'error');
    }
  };

  const handleDeleteKey = async (key: string) => {
    try {
      await keyApi.deleteKey(key);
      showSnackbar('密钥删除成功');
      loadKeys();
    } catch (error: any) {
      showSnackbar(`删除密钥失败: ${error.message}`, 'error');
    }
  };

  const handleDisableKey = async (key: string) => {
    try {
      await keyApi.disableKey(key);
      showSnackbar('密钥禁用成功');
      loadKeys();
    } catch (error: any) {
      showSnackbar(`禁用密钥失败: ${error.message}`, 'error');
    }
  };

  const handleEnableKey = async (key: string) => {
    try {
      await keyApi.enableKey(key);
      showSnackbar('密钥启用成功');
      loadKeys();
    } catch (error: any) {
      showSnackbar(`启用密钥失败: ${error.message}`, 'error');
    }
  };

  const handleTestKey = async () => {
    try {
      const result = await keyApi.testKey(testFormData);
      if (result.statusCode === 200) {
        showSnackbar(`密钥测试成功！音频大小: ${result.audioSize} 字节`);
      } else {
        showSnackbar(`密钥测试失败: ${result.error || '未知错误'}`, 'error');
      }
      setTestModalVisible(false);
      setTestFormData({ key: '', region: '' });
      loadKeys();
    } catch (error: any) {
      showSnackbar(`测试密钥失败: ${error.message}`, 'error');
    }
  };

  const openTestModal = (key: AzureKey) => {
    setCurrentKey(key);
    setTestFormData({
      key: key.key,
      region: key.region
    });
    setTestModalVisible(true);
  };

  const openEditModal = (key: AzureKey) => {
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
      await keyApi.updateKey(currentKey.key, editFormData.keyname, editFormData.region);
      showSnackbar('密钥更新成功');
      setEditModalVisible(false);
      setEditFormData({ keyname: '', region: '' });
      setCurrentKey(null);
      loadKeys();
    } catch (error: any) {
      showSnackbar(`更新密钥失败: ${error.message}`, 'error');
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
          case 'enable': return keyApi.enableKey(key);
          case 'disable': return keyApi.disableKey(key);
          case 'delete': return keyApi.deleteKey(key);
          default: return Promise.resolve();
        }
      });

      await Promise.all(promises);
      const actionText = action === 'enable' ? '启用' : action === 'disable' ? '禁用' : '删除';
      showSnackbar(`成功${actionText}了 ${selectedKeys.length} 个密钥`);
      setSelectedKeys([]);
      setBulkMenuAnchor(null);
      loadKeys();
    } catch (error: any) {
      const actionText = action === 'enable' ? '启用' : action === 'disable' ? '禁用' : '删除';
      showSnackbar(`批量${actionText}密钥失败: ${error.message}`, 'error');
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
    a.download = `azure-keys-${dayjs().format('YYYY-MM-DD-HH-mm-ss')}.csv`;
    a.click();
    window.URL.revokeObjectURL(url);
  };

  return (
    <Layout>
      <Box>
        <Box sx={{ mb: 3 }}>
          <Typography variant="h4" component="h1" sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 3 }}>
            <KeyIcon /> 密钥管理
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
              添加密钥
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
              variant="outlined"
            >
              导出CSV
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

        <TableContainer component={Paper}>
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
              {keys.slice(page * rowsPerPage, page * rowsPerPage + rowsPerPage).map((key) => (
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
                    <Chip label={key.region} size="small" color="primary" />
                  </TableCell>
                  <TableCell>
                    <Chip
                      label={key.status.toUpperCase()}
                      size="small"
                      color={key.status === 'enabled' ? 'success' : key.status === 'disabled' ? 'error' : 'warning'}
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
                      <Tooltip title="编辑">
                        <IconButton size="small" onClick={() => openEditModal(key)}>
                          <EditIcon />
                        </IconButton>
                      </Tooltip>
                      <Tooltip title="测试">
                        <IconButton size="small" onClick={() => openTestModal(key)}>
                          <TestIcon />
                        </IconButton>
                      </Tooltip>
                      {key.status === KeyStatus.ENABLED ? (
                        <Tooltip title="禁用">
                          <IconButton size="small" color="error" onClick={() => handleDisableKey(key.key)}>
                            <StopIcon />
                          </IconButton>
                        </Tooltip>
                      ) : (
                        <Tooltip title="启用">
                          <IconButton size="small" color="primary" onClick={() => handleEnableKey(key.key)}>
                            <PlayIcon />
                          </IconButton>
                        </Tooltip>
                      )}
                      <Tooltip title="删除">
                        <IconButton size="small" color="error" onClick={() => handleDeleteKey(key.key)}>
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
            count={keys.length}
            rowsPerPage={rowsPerPage}
            page={page}
            onPageChange={handleChangePage}
            onRowsPerPageChange={handleChangeRowsPerPage}
          />
        </TableContainer>

        {/* Add Key Dialog */}
        <Dialog open={addModalVisible} onClose={() => setAddModalVisible(false)} maxWidth="sm" fullWidth>
          <DialogTitle>添加新密钥</DialogTitle>
          <DialogContent>
            <Box sx={{ pt: 1 }}>
              <TextField
                fullWidth
                multiline
                rows={3}
                label="Azure 语音服务密钥"
                value={addFormData.key}
                onChange={(e) => setAddFormData({ ...addFormData, key: e.target.value })}
                placeholder="请输入您的 Azure 语音服务订阅密钥"
                margin="normal"
                required
              />
              <FormControl fullWidth margin="normal" required>
                <InputLabel>区域</InputLabel>
                <Select
                  value={addFormData.region}
                  onChange={(e) => setAddFormData({ ...addFormData, region: e.target.value })}
                  label="区域"
                >
                  {REGIONS.map(region => (
                    <MenuItem key={region} value={region}>{region}</MenuItem>
                  ))}
                </Select>
              </FormControl>
              <TextField
                fullWidth
                label="密钥名称"
                value={addFormData.keyname}
                onChange={(e) => setAddFormData({ ...addFormData, keyname: e.target.value })}
                placeholder="请输入密钥的描述性名称"
                margin="normal"
                required
              />
            </Box>
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setAddModalVisible(false)}>取消</Button>
            <Button
              variant="contained"
              onClick={handleAddKey}
              disabled={!addFormData.key || !addFormData.region || !addFormData.keyname}
            >
              添加密钥
            </Button>
          </DialogActions>
        </Dialog>

        {/* Test Key Dialog */}
        <Dialog open={testModalVisible} onClose={() => setTestModalVisible(false)} maxWidth="sm" fullWidth>
          <DialogTitle>测试密钥</DialogTitle>
          <DialogContent>
            <Box sx={{ pt: 1 }}>
              <TextField
                fullWidth
                label="密钥"
                value={testFormData.key}
                disabled
                margin="normal"
              />
              <FormControl fullWidth margin="normal" required>
                <InputLabel>区域</InputLabel>
                <Select
                  value={testFormData.region}
                  onChange={(e) => setTestFormData({ ...testFormData, region: e.target.value })}
                  label="区域"
                >
                  {REGIONS.map(region => (
                    <MenuItem key={region} value={region}>{region}</MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Box>
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setTestModalVisible(false)}>取消</Button>
            <Button
              variant="contained"
              onClick={handleTestKey}
              disabled={!testFormData.region}
            >
              测试密钥
            </Button>
          </DialogActions>
        </Dialog>

        {/* Edit Key Dialog */}
        <Dialog open={editModalVisible} onClose={() => setEditModalVisible(false)} maxWidth="sm" fullWidth>
          <DialogTitle>编辑密钥</DialogTitle>
          <DialogContent>
            <Box sx={{ pt: 1 }}>
              <TextField
                fullWidth
                label="密钥名称"
                value={editFormData.keyname}
                onChange={(e) => setEditFormData({ ...editFormData, keyname: e.target.value })}
                placeholder="请输入密钥的描述性名称"
                margin="normal"
                required
              />
              <FormControl fullWidth margin="normal" required>
                <InputLabel>区域</InputLabel>
                <Select
                  value={editFormData.region}
                  onChange={(e) => setEditFormData({ ...editFormData, region: e.target.value })}
                  label="区域"
                >
                  {REGIONS.map(region => (
                    <MenuItem key={region} value={region}>{region}</MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Box>
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setEditModalVisible(false)}>取消</Button>
            <Button
              variant="contained"
              onClick={handleEditKey}
              disabled={!editFormData.keyname || !editFormData.region}
            >
              更新密钥
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

export default KeysPage;
