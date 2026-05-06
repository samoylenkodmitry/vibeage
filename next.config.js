/** @type {import('next').NextConfig} */
const isProd = process.env.NODE_ENV === 'production';

const nextConfig = {
  output: 'export',
  images: {
    unoptimized: true
  },
  webpack: (config) => {
    config.externals = [
      ...(config.externals || []),
      { bufferutil: 'bufferutil', 'utf-8-validate': 'utf-8-validate' }
    ];
    return config;
  },
  compiler: {
    removeConsole: isProd ? { exclude: ['error', 'warn'] } : false,
  },
};

export default nextConfig;
