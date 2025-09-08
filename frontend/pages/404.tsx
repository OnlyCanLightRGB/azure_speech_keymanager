import React from 'react';
import { Box, Typography, Button, Container } from '@mui/material';
import { SearchOff as NotFoundIcon, Home as HomeIcon } from '@mui/icons-material';
import Layout from '../components/Layout';
import { useRouter } from 'next/router';

const NotFoundPage: React.FC = () => {
  const router = useRouter();

  const handleGoHome = () => {
    router.push('/');
  };

  const handleGoBack = () => {
    router.back();
  };

  return (
    <Layout>
      <Container maxWidth="md">
        <Box
          sx={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            minHeight: '60vh',
            textAlign: 'center',
            gap: 3,
          }}
        >
          <NotFoundIcon sx={{ fontSize: 80, color: 'text.secondary' }} />
          
          <Typography variant="h2" component="h1" gutterBottom>
            404
          </Typography>
          
          <Typography variant="h4" component="h2" gutterBottom color="text.secondary">
            页面未找到
          </Typography>
          
          <Typography variant="body1" color="text.secondary" sx={{ mb: 4 }}>
            抱歉，您访问的页面不存在或已被移动。
          </Typography>
          
          <Box sx={{ display: 'flex', gap: 2 }}>
            <Button
              variant="contained"
              startIcon={<HomeIcon />}
              onClick={handleGoHome}
              size="large"
            >
              返回首页
            </Button>
            
            <Button
              variant="outlined"
              onClick={handleGoBack}
              size="large"
            >
              返回上页
            </Button>
          </Box>
        </Box>
      </Container>
    </Layout>
  );
};

export default NotFoundPage;