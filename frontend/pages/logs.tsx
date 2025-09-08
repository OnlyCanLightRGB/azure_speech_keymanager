import React, { useState, useEffect } from 'react';
import {
  Box,
  Card,
  CardContent,
  Button,
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

  TablePagination,
  InputAdornment,
} from '@mui/material';
import SafeChip from '../components/SafeChip';
import {
  Description as FileTextIcon,
  Refresh as RefreshIcon,
  Search as SearchIcon,
  FilterAlt as FilterIcon,
} from '@mui/icons-material';
import Layout from '../components/Layout';
import { keyApi, translationApi } from '../utils/api';
import { KeyLog, LogAction, LogsResponse } from '../types';
import dayjs from 'dayjs';
import isBetween from 'dayjs/plugin/isBetween';

dayjs.extend(isBetween);

const LogsPage: React.FC = () => {
  const [logs, setLogs] = useState<KeyLog[]>([]);
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(50);
  const [totalCount, setTotalCount] = useState(0);
  const [filters, setFilters] = useState({
    action: '',
    search: '',
    startDate: '',
    endDate: '',
    keyType: 'all' // 'all', 'speech', 'translation'
  });

  useEffect(() => {
    loadLogs();
  }, [filters.keyType]); // Reload when key type filter changes

  const loadLogs = async () => {
    setLoading(true);
    try {
      let allLogs: KeyLog[] = [];
      let totalCount = 0;

      if (filters.keyType === 'all' || filters.keyType === 'speech') {
        const speechData: LogsResponse = await keyApi.getKeyLogs(1, 10000);
        // Add key type identifier to speech logs
        const speechLogs = speechData.logs.map(log => ({ ...log, keyType: 'speech' as const }));
        allLogs = [...allLogs, ...speechLogs];
        totalCount += speechData.total;
      }

      if (filters.keyType === 'all' || filters.keyType === 'translation') {
        const translationData: LogsResponse = await translationApi.getKeyLogs(1, 10000);
        // Add key type identifier to translation logs
        const translationLogs = translationData.logs.map(log => ({ ...log, keyType: 'translation' as const }));
        allLogs = [...allLogs, ...translationLogs];
        totalCount += translationData.total;
      }

      // Sort by created_at descending
      allLogs.sort((a, b) => {
        const dateA = a.created_at ? new Date(a.created_at).getTime() : 0;
        const dateB = b.created_at ? new Date(b.created_at).getTime() : 0;
        return dateB - dateA;
      });
      
      setLogs(allLogs);
      setTotalCount(totalCount);
    } catch (error: any) {
      console.error('Failed to load logs:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleChangePage = (event: unknown, newPage: number) => {
    setPage(newPage);
  };

  const handleChangeRowsPerPage = (event: React.ChangeEvent<HTMLInputElement>) => {
    setRowsPerPage(parseInt(event.target.value, 10));
    setPage(0);
  };

  // Reset page when filters change
  useEffect(() => {
    setPage(0);
  }, [filters]);

  const filteredLogs = logs.filter(log => {
    // Filter by action
    if (filters.action && log.action !== filters.action) {
      return false;
    }

    // Filter by search term
    if (filters.search) {
      const searchTerm = filters.search.toLowerCase();
      const searchableText = [
        log.keyname || '',
        log.region || '',
        log.note || '',
        log.action
      ].join(' ').toLowerCase();

      if (!searchableText.includes(searchTerm)) {
        return false;
      }
    }

    // Filter by date range
    if (filters.startDate && filters.endDate) {
      const logDate = dayjs(log.created_at);
      if (!logDate.isBetween(filters.startDate, filters.endDate, 'day', '[]')) {
        return false;
      }
    }

    return true;
  });

  const getStatusCodeColor = (code: number) => {
    if (!code) return 'default';
    if (code >= 200 && code < 300) return 'success';
    if (code >= 400 && code < 500) return 'warning';
    if (code >= 500) return 'error';
    return 'default';
  };

  const getActionColor = (action: LogAction) => {
    switch (action) {
      case LogAction.ADD_KEY: return 'success';
      case LogAction.DELETE_KEY: return 'error';
      case LogAction.DISABLE_KEY: return 'warning';
      case LogAction.ENABLE_KEY: return 'success';
      case LogAction.TEST_KEY: return 'info';
      case LogAction.GET_KEY: return 'primary';
      case LogAction.SET_STATUS: return 'warning';
      case LogAction.COOLDOWN_START: return 'warning';
      case LogAction.COOLDOWN_END: return 'success';
      default: return 'default';
    }
  };



  return (
    <Layout>
      <Box>
        <Box sx={{ mb: 3 }}>
          <Typography variant="h4" component="h1" sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 3 }}>
            <FileTextIcon /> 操作日志
          </Typography>

          {/* Filters */}
          <Card sx={{ mb: 2 }}>
            <CardContent>
              <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 2, alignItems: 'center' }}>
                <TextField
                  placeholder="搜索日志..."
                  value={filters.search}
                  onChange={(e) => setFilters(prev => ({ ...prev, search: e.target.value }))}
                  size="small"
                  sx={{ minWidth: 200 }}
                  InputProps={{
                    startAdornment: (
                      <InputAdornment position="start">
                        <SearchIcon />
                      </InputAdornment>
                    ),
                  }}
                />

                <FormControl size="small" sx={{ minWidth: 150 }}>
                  <InputLabel>密钥类型</InputLabel>
                  <Select
                    value={filters.keyType}
                    onChange={(e) => setFilters(prev => ({ ...prev, keyType: e.target.value }))}
                    label="密钥类型"
                  >
                    <MenuItem value="all">全部密钥</MenuItem>
                    <MenuItem value="speech">语音密钥</MenuItem>
                    <MenuItem value="translation">翻译密钥</MenuItem>
                  </Select>
                </FormControl>

                <FormControl size="small" sx={{ minWidth: 150 }}>
                  <InputLabel>按操作筛选</InputLabel>
                  <Select
                    value={filters.action}
                    onChange={(e) => setFilters(prev => ({ ...prev, action: e.target.value }))}
                    label="按操作筛选"
                  >
                    <MenuItem value="">所有操作</MenuItem>
                    {Object.values(LogAction).map(action => (
                      <MenuItem key={action} value={action}>
                        {action.replace('_', ' ').toUpperCase()}
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>

                <TextField
                  type="date"
                  label="开始日期"
                  value={filters.startDate}
                  onChange={(e) => setFilters(prev => ({ ...prev, startDate: e.target.value }))}
                  size="small"
                  InputLabelProps={{ shrink: true }}
                />

                <TextField
                  type="date"
                  label="结束日期"
                  value={filters.endDate}
                  onChange={(e) => setFilters(prev => ({ ...prev, endDate: e.target.value }))}
                  size="small"
                  InputLabelProps={{ shrink: true }}
                />

                <Button
                  startIcon={<RefreshIcon />}
                  onClick={loadLogs}
                  disabled={loading}
                  variant="outlined"
                >
                  刷新
                </Button>

                <Button
                  startIcon={<FilterIcon />}
                  onClick={() => setFilters({ action: '', search: '', startDate: '', endDate: '', keyType: 'all' })}
                  variant="outlined"
                >
                  清除筛选
                </Button>
              </Box>
            </CardContent>
          </Card>
        </Box>

        <TableContainer component={Paper}>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>时间</TableCell>
                <TableCell>密钥类型</TableCell>
                <TableCell>操作</TableCell>
                <TableCell>密钥名称</TableCell>
                <TableCell>区域</TableCell>
                <TableCell>状态码</TableCell>
                <TableCell>备注</TableCell>
                <TableCell>IP地址</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {filteredLogs.slice(page * rowsPerPage, (page + 1) * rowsPerPage).map((log) => (
                <TableRow key={log.id}>
                  <TableCell>
                    {dayjs(log.created_at).format('YYYY-MM-DD HH:mm:ss')}
                  </TableCell>
                  <TableCell>
                    <SafeChip
                      label={log.keyType === 'translation' ? '翻译密钥' : '语音密钥'}
                      size="small"
                      color={log.keyType === 'translation' ? 'secondary' : 'primary'}
                    />
                  </TableCell>
                  <TableCell>
                    <SafeChip
                      label={log.action.replace('_', ' ').toUpperCase()}
                      size="small"
                      color={getActionColor(log.action) as any}
                    />
                  </TableCell>
                  <TableCell>{log.keyname || '无'}</TableCell>
                  <TableCell>
                    {log.region ? (
                      <SafeChip label={log.region} size="small" color="primary" />
                    ) : (
                      '无'
                    )}
                  </TableCell>
                  <TableCell>
                    {log.status_code ? (
                      <SafeChip
                        label={log.status_code}
                        size="small"
                        color={getStatusCodeColor(log.status_code) as any}
                      />
                    ) : (
                      '无'
                    )}
                  </TableCell>
                  <TableCell sx={{ maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {log.note || '无'}
                  </TableCell>
                  <TableCell>{log.ip_address || '无'}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <TablePagination
            rowsPerPageOptions={[25, 50, 100]}
            component="div"
            count={filteredLogs.length}
            rowsPerPage={rowsPerPage}
            page={page}
            onPageChange={handleChangePage}
            onRowsPerPageChange={handleChangeRowsPerPage}
          />
        </TableContainer>
      </Box>
    </Layout>
  );
};

export default LogsPage;
