import React from 'react';
import { NextPage, NextPageContext } from 'next';
import { Box, Typography, Button, Container } from '@mui/material';
import { Error as ErrorIcon, Home as HomeIcon } from '@mui/icons-material';
import Layout from '../components/Layout';
import { useRouter } from 'next/router';

interface ErrorProps {
  statusCode?: number;
  hasGetInitialPropsRun?: boolean;
  err?: Error;
}

const ErrorPage: NextPage<ErrorProps> = ({ statusCode, hasGetInitialPropsRun, err }) => {
  const router = useRouter();

  const getErrorMessage = () => {
    if (statusCode === 404) {
      return '页面未找到';
    }
    if (statusCode === 500) {
      return '服务器内部错误';
    }
    if (statusCode) {
      return `发生了一个 ${statusCode} 错误`;
    }
    return '客户端发生了一个错误';
  };

  const getErrorDescription = () => {
    if (statusCode === 404) {
      return '抱歉，您访问的页面不存在。';
    }
    if (statusCode === 500) {
      return '服务器遇到了一个错误，请稍后再试。';
    }
    return '抱歉，发生了一个意外错误。';
  };

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
          <ErrorIcon sx={{ fontSize: 80, color: 'error.main' }} />
          
          <Typography variant="h3" component="h1" gutterBottom>
            {statusCode || 'Error'}
          </Typography>
          
          <Typography variant="h5" component="h2" gutterBottom color="text.secondary">
            {getErrorMessage()}
          </Typography>
          
          <Typography variant="body1" color="text.secondary" sx={{ mb: 4 }}>
            {getErrorDescription()}
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
          
          {process.env.NODE_ENV === 'development' && err && (
            <Box sx={{ mt: 4, p: 2, bgcolor: 'grey.100', borderRadius: 1, maxWidth: '100%' }}>
              <Typography variant="subtitle2" gutterBottom>
                开发模式错误信息:
              </Typography>
              <Typography variant="body2" component="pre" sx={{ 
                whiteSpace: 'pre-wrap', 
                wordBreak: 'break-word',
                fontSize: '0.8rem',
                color: 'error.main'
              }}>
                {err.message}
                {err.stack && `\n\n${err.stack}`}
              </Typography>
            </Box>
          )}
        </Box>
      </Container>
    </Layout>
  );
};

ErrorPage.getInitialProps = ({ res, err }: NextPageContext) => {
  const statusCode = res ? res.statusCode : err ? err.statusCode : 404;
  return { statusCode };
};

export default ErrorPage;