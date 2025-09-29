const path = require('path');
const dotenv = require('dotenv');

// Load environment variables from parent directory's .env file
dotenv.config({ path: path.join(__dirname, '../.env') });

/** @type {import('next').NextConfig} */
const nextConfig = {
  async rewrites() {
    // If NEXT_PUBLIC_API_URL is not set or empty, use relative path for production
    const apiUrl = process.env.NEXT_PUBLIC_API_URL;
    if (!apiUrl) {
      // In Docker container, both frontend and backend run in the same container
      // Frontend should proxy to backend via 127.0.0.1 on the backend port
      const backendPort = process.env.BACKEND_PORT || process.env.PORT || '3019';
      const isDocker = process.env.NODE_ENV === 'production' && process.env.DOCKER_ENV === 'true';

      if (isDocker) {
        // In Docker, use 127.0.0.1 to communicate within the same container
        // Avoid IPv6 localhost (::1) issues by explicitly using IPv4
        return [
          {
            source: '/api/:path*',
            destination: `http://127.0.0.1:${backendPort}/api/:path*`
          }
        ];
      } else {
        // In development or non-Docker production, use 127.0.0.1
        return [
          {
            source: '/api/:path*',
            destination: `http://127.0.0.1:${backendPort}/api/:path*`
          }
        ];
      }
    }

    // Replace localhost with 127.0.0.1 to avoid IPv6 issues
    const destination = apiUrl.replace('localhost', '127.0.0.1');
    return [
      {
        source: '/api/:path*',
        destination: `${destination}/api/:path*`
      }
    ];
  },
  // 增加服务器配置以处理长时间运行的请求
  serverRuntimeConfig: {
    // 增加请求超时时间
    requestTimeout: 120000 // 2分钟
  },
  env: {
    NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL || ''
  }
};

module.exports = nextConfig;
