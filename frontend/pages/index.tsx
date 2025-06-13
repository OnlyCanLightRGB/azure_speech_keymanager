import React, { useState, useEffect } from 'react';
import {
  Box,
  Card,
  CardContent,
  Grid,
  Typography,
  Button,
  Alert,
  CircularProgress,
  List,
  ListItem,
  ListItemText,
  Chip,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  LinearProgress,
} from '@mui/material';
import {
  Dashboard as DashboardIcon,
  VpnKey as KeyIcon,
  CheckCircle as CheckCircleIcon,
  Stop as StopIcon,
  Schedule as ClockIcon,
  Warning as WarningIcon,
  Refresh as RefreshIcon,
} from '@mui/icons-material';
import Layout from '../components/Layout';
import { keyApi, systemApi } from '../utils/api';
import { AzureKey, KeyStatus, KeyStats, CooldownKey } from '../types';
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';

dayjs.extend(relativeTime);

const DashboardPage: React.FC = () => {
  const [keys, setKeys] = useState<AzureKey[]>([]);
  const [stats, setStats] = useState<KeyStats | null>(null);
  const [healthStatus, setHealthStatus] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    loadDashboardData();
    
    // Auto refresh every 30 seconds
    const interval = setInterval(loadDashboardData, 30000);
    return () => clearInterval(interval);
  }, []);

  const loadDashboardData = async () => {
    setLoading(true);
    try {
      const [keysData, statsData, healthData] = await Promise.all([
        keyApi.getAllKeys(),
        keyApi.getKeyStats(),
        systemApi.healthCheck().catch(() => ({ success: false, error: 'Health check failed' }))
      ]);
      
      setKeys(keysData);
      setStats(statsData);
      setHealthStatus(healthData);
    } catch (error: any) {
      console.error('Failed to load dashboard data:', error);
    } finally {
      setLoading(false);
    }
  };

  // Calculate key statistics
  const keyStats = {
    total: keys.length,
    enabled: keys.filter(k => k.status === KeyStatus.ENABLED).length,
    disabled: keys.filter(k => k.status === KeyStatus.DISABLED).length,
    cooldown: keys.filter(k => k.status === KeyStatus.COOLDOWN).length,
    totalUsage: keys.reduce((sum, k) => sum + (k.usage_count || 0), 0),
    totalErrors: keys.reduce((sum, k) => sum + (k.error_count || 0), 0)
  };

  // Get recent activity (keys with recent usage)
  const recentActivity = keys
    .filter(k => k.last_used)
    .sort((a, b) => new Date(b.last_used!).getTime() - new Date(a.last_used!).getTime())
    .slice(0, 5);

  // Get problematic keys (high error rate)
  const problematicKeys = keys
    .filter(k => (k.error_count || 0) > 0)
    .sort((a, b) => (b.error_count || 0) - (a.error_count || 0))
    .slice(0, 5);

  const formatCooldownTime = (cooldownUntil: number) => {
    const remaining = Math.max(0, Math.ceil((cooldownUntil - Date.now()) / 1000));
    const minutes = Math.floor(remaining / 60);
    const seconds = remaining % 60;
    return `${minutes}m ${seconds}s`;
  };



  return (
    <Layout>
      <Box>
        <Box sx={{ mb: 3, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Typography variant="h4" component="h1" sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <DashboardIcon /> 仪表板
          </Typography>

          <Button
            variant="contained"
            startIcon={<RefreshIcon />}
            onClick={loadDashboardData}
            disabled={loading}
          >
            {loading ? <CircularProgress size={20} /> : '刷新'}
          </Button>
        </Box>

        {/* System Health Alert */}
        {healthStatus && !healthStatus.success && (
          <Alert
            severity="warning"
            sx={{ mb: 3 }}
          >
            <Typography variant="h6">系统健康警告</Typography>
            {healthStatus.error || '系统状态异常'}
          </Alert>
        )}

        {/* Key Statistics */}
        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 2, mb: 3 }}>
          <Card sx={{ flex: '1 1 250px' }}>
            <CardContent>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <KeyIcon color="primary" />
                <Box>
                  <Typography variant="h6">{keyStats.total}</Typography>
                  <Typography variant="body2" color="text.secondary">总密钥数</Typography>
                </Box>
              </Box>
            </CardContent>
          </Card>
          <Card sx={{ flex: '1 1 250px' }}>
            <CardContent>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <CheckCircleIcon sx={{ color: 'success.main' }} />
                <Box>
                  <Typography variant="h6" sx={{ color: 'success.main' }}>{keyStats.enabled}</Typography>
                  <Typography variant="body2" color="text.secondary">已启用密钥</Typography>
                </Box>
              </Box>
            </CardContent>
          </Card>
          <Card sx={{ flex: '1 1 250px' }}>
            <CardContent>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <StopIcon sx={{ color: 'error.main' }} />
                <Box>
                  <Typography variant="h6" sx={{ color: 'error.main' }}>{keyStats.disabled}</Typography>
                  <Typography variant="body2" color="text.secondary">已禁用密钥</Typography>
                </Box>
              </Box>
            </CardContent>
          </Card>
          <Card sx={{ flex: '1 1 250px' }}>
            <CardContent>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <ClockIcon sx={{ color: 'warning.main' }} />
                <Box>
                  <Typography variant="h6" sx={{ color: 'warning.main' }}>{keyStats.cooldown}</Typography>
                  <Typography variant="body2" color="text.secondary">冷却中密钥</Typography>
                </Box>
              </Box>
            </CardContent>
          </Card>
        </Box>

        {/* Usage Statistics */}
        <Box sx={{ display: 'flex', gap: 2, mb: 3 }}>
          <Card sx={{ flex: 1 }}>
            <CardContent>
              <Typography variant="h6">{keyStats.totalUsage}</Typography>
              <Typography variant="body2" color="text.secondary">总API调用次数</Typography>
            </CardContent>
          </Card>
          <Card sx={{ flex: 1 }}>
            <CardContent>
              <Typography
                variant="h6"
                sx={{ color: keyStats.totalErrors > 0 ? 'error.main' : 'success.main' }}
              >
                {keyStats.totalErrors}
              </Typography>
              <Typography variant="body2" color="text.secondary">总错误次数</Typography>
            </CardContent>
          </Card>
        </Box>

        {/* Health Indicator */}
        <Card sx={{ mb: 3 }}>
          <CardContent>
            <Typography variant="h6" gutterBottom>系统健康状态</Typography>
            <Box sx={{ display: 'flex', justifyContent: 'space-around', flexWrap: 'wrap', gap: 2 }}>
              <Box sx={{ textAlign: 'center' }}>
                <Box sx={{ position: 'relative', display: 'inline-flex' }}>
                  <CircularProgress
                    variant="determinate"
                    value={keyStats.total > 0 ? Math.round((keyStats.enabled / keyStats.total) * 100) : 0}
                    size={80}
                    sx={{ color: 'success.main' }}
                  />
                  <Box
                    sx={{
                      top: 0,
                      left: 0,
                      bottom: 0,
                      right: 0,
                      position: 'absolute',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <Typography variant="caption" component="div" color="text.secondary">
                      {keyStats.enabled}/{keyStats.total}
                    </Typography>
                  </Box>
                </Box>
                <Typography variant="body2" sx={{ mt: 1 }}>可用密钥</Typography>
              </Box>
              <Box sx={{ textAlign: 'center' }}>
                <Box sx={{ position: 'relative', display: 'inline-flex' }}>
                  <CircularProgress
                    variant="determinate"
                    value={keyStats.totalUsage > 0 ? Math.round(((keyStats.totalUsage - keyStats.totalErrors) / keyStats.totalUsage) * 100) : 100}
                    size={80}
                    sx={{ color: 'primary.main' }}
                  />
                  <Box
                    sx={{
                      top: 0,
                      left: 0,
                      bottom: 0,
                      right: 0,
                      position: 'absolute',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <Typography variant="caption" component="div" color="text.secondary">
                      {((keyStats.totalUsage - keyStats.totalErrors) / Math.max(keyStats.totalUsage, 1) * 100).toFixed(1)}%
                    </Typography>
                  </Box>
                </Box>
                <Typography variant="body2" sx={{ mt: 1 }}>成功率</Typography>
              </Box>
              <Box sx={{ textAlign: 'center' }}>
                <Box sx={{ position: 'relative', display: 'inline-flex' }}>
                  <CircularProgress
                    variant="determinate"
                    value={stats ? Math.min((stats.cooldown.totalCooldownKeys / Math.max(keyStats.total, 1)) * 100, 100) : 0}
                    size={80}
                    sx={{ color: 'warning.main' }}
                  />
                  <Box
                    sx={{
                      top: 0,
                      left: 0,
                      bottom: 0,
                      right: 0,
                      position: 'absolute',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <Typography variant="caption" component="div" color="text.secondary">
                      {stats?.cooldown.totalCooldownKeys || 0}
                    </Typography>
                  </Box>
                </Box>
                <Typography variant="body2" sx={{ mt: 1 }}>冷却密钥</Typography>
              </Box>
            </Box>
          </CardContent>
        </Card>

        <Box sx={{ display: 'flex', gap: 2, mb: 3, flexWrap: 'wrap' }}>
          {/* Recent Activity */}
          <Card sx={{ flex: 1, minWidth: '300px' }}>
            <CardContent>
              <Typography variant="h6" gutterBottom>最近活动</Typography>
              <List>
                {recentActivity.length > 0 ? recentActivity.map((key) => (
                  <ListItem key={key.id} divider>
                    <ListItemText
                      primary={key.keyname}
                      secondary={
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
                          <Chip label={key.region} size="small" color="primary" />
                          <Typography variant="body2" color="text.secondary">
                            最后使用: {dayjs(key.last_used).fromNow()}
                          </Typography>
                        </Box>
                      }
                    />
                    <Typography variant="body2">{key.usage_count || 0} 次使用</Typography>
                  </ListItem>
                )) : (
                  <ListItem>
                    <ListItemText primary="暂无最近活动" />
                  </ListItem>
                )}
              </List>
            </CardContent>
          </Card>

          {/* Cooldown Status */}
          <Card sx={{ flex: 1, minWidth: '300px' }}>
            <CardContent>
              <Typography variant="h6" gutterBottom>活跃冷却</Typography>
              <List>
                {(stats?.cooldownKeys || []).length > 0 ? (stats?.cooldownKeys || []).map((cooldownKey: CooldownKey, index: number) => (
                  <ListItem key={index} divider>
                    <ListItemText
                      primary={<Typography variant="body2" component="code">{cooldownKey.key}</Typography>}
                      secondary={
                        <Typography variant="body2" color="text.secondary">
                          剩余时间: {formatCooldownTime(cooldownKey.cooldownUntil)}
                        </Typography>
                      }
                    />
                  </ListItem>
                )) : (
                  <ListItem>
                    <ListItemText primary="暂无冷却密钥" />
                  </ListItem>
                )}
              </List>
            </CardContent>
          </Card>
        </Box>

        {/* Problematic Keys */}
        {problematicKeys.length > 0 && (
          <Card sx={{ mb: 2 }}>
            <CardContent>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
                <WarningIcon sx={{ color: 'warning.main' }} />
                <Typography variant="h6">有错误的密钥</Typography>
              </Box>
              <TableContainer component={Paper}>
                <Table size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell>密钥名称</TableCell>
                      <TableCell>区域</TableCell>
                      <TableCell>状态</TableCell>
                      <TableCell>使用次数</TableCell>
                      <TableCell>错误次数</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {problematicKeys.map((key) => (
                      <TableRow key={key.id}>
                        <TableCell><strong>{key.keyname}</strong></TableCell>
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
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
            </CardContent>
          </Card>
        )}
      </Box>
    </Layout>
  );
};

export default DashboardPage;
