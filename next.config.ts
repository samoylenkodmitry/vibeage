import type { NextConfig } from "next";

const isProd = process.env.NODE_ENV === 'production';

const nextConfig: NextConfig = {
  webpack: (config) => {
    config.externals = [...(config.externals || []), { bufferutil: 'bufferutil', 'utf-8-validate': 'utf-8-validate' }];
    return config;
  },
  
  // Kills console.* except error/warn in prod
  compiler: {
    removeConsole: isProd ? { exclude: ['error', 'warn'] } : false,
  },
  
  // Add rewrites for Socket.IO
  rewrites: async () => {
    return [
      {
        source: '/socket.io/:path*',
        destination: 'http://localhost:3001/socket.io/:path*',
      },
    ];
  },
};

export default nextConfig;
