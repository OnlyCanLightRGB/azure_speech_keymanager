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
      // In production with Docker, backend runs on port 3019 on the same container
      // Use 127.0.0.1 instead of localhost to avoid IPv6 issues
      return [
        {
          source: '/api/:path*',
          destination: 'http://127.0.0.1:3019/api/:path*'
        }
      ];
    }

    return [
      {
        source: '/api/:path*',
        destination: `${apiUrl}/api/:path*`
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
