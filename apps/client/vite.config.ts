import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

const clientRoot = fileURLToPath(new URL('.', import.meta.url));

export default defineConfig({
  root: clientRoot,
  plugins: [react()],
  server: {
    host: '127.0.0.1',
    port: 5173,
    proxy: {
      '/socket.io': {
        target: process.env.GAME_SERVER_PROXY_TARGET ?? 'http://127.0.0.1:3001',
        ws: true,
        changeOrigin: true,
      },
      '/healthz': {
        target: process.env.GAME_SERVER_PROXY_TARGET ?? 'http://127.0.0.1:3001',
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
  css: {
    postcss: {
      plugins: [],
    },
  },
});
