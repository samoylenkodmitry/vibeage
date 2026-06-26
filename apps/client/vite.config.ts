import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

const clientRoot = fileURLToPath(new URL('.', import.meta.url));
const indexHtml = fileURLToPath(new URL('./index.html', import.meta.url));
// Standalone in-engine asset showroom (not linked from the game). Reachable at
// /showroom.html for reviewing/screenshotting registry models under real lighting.
const showroomHtml = fileURLToPath(new URL('./showroom.html', import.meta.url));

export default defineConfig({
  root: clientRoot,
  publicDir: '../../public',
  plugins: [react()],
  server: {
    host: '127.0.0.1',
    port: 5173,
    proxy: {
      '/colyseus': {
        target: process.env.GAME_SERVER_PROXY_TARGET ?? 'http://127.0.0.1:3001',
        ws: true,
        changeOrigin: true,
      },
      '/healthz': {
        target: process.env.GAME_SERVER_PROXY_TARGET ?? 'http://127.0.0.1:3001',
        changeOrigin: true,
      },
      '/api': {
        target: process.env.GAME_SERVER_PROXY_TARGET ?? 'http://127.0.0.1:3001',
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    chunkSizeWarningLimit: 1500,
    // Emit .vite/manifest.json so the perf budget can measure the *initial*
    // entry graph (index.html → main, static imports only) rather than the
    // sum of every chunk — the 3D world is a lazy chunk and the showroom is a
    // separate dev entry, neither of which a player downloads to reach the lobby.
    manifest: true,
    rollupOptions: {
      input: { main: indexHtml, showroom: showroomHtml },
    },
  },
  css: {
    postcss: {
      plugins: [],
    },
  },
});
