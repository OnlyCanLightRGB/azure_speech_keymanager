const path = require('path');
const dotenv = require('dotenv');

// Load environment variables from parent directory's .env file
dotenv.config({ path: path.join(__dirname, '../.env') });

/** @type {import('next').NextConfig} */
const nextConfig = {
  async rewrites() {
    return [
      {
        source: '/api/:path*',
        destination: `${process.env.NEXT_PUBLIC_API_URL || 'http://127.0.0.1:3019'}/api/:path*`
      }
    ];
  },
  env: {
    NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL || 'http://127.0.0.1:3019'
  }
};

module.exports = nextConfig;
