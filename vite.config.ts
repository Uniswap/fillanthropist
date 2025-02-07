import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src')
    }
  },
  server: {
    port: parseInt(process.env.VITE_DEV_PORT || '5173'),
    host: process.env.VITE_DEV_HOST || 'localhost',
    proxy: {
      '/api': {
        target: process.env.VITE_SERVER_URL || 'http://localhost:3001',
        changeOrigin: true
      },
      '/broadcast': {
        target: process.env.VITE_SERVER_URL || 'http://localhost:3001',
        changeOrigin: true
      },
      '/ws': {
        target: process.env.VITE_SERVER_URL || 'http://localhost:3001',
        changeOrigin: true,
        ws: true
      }
    }
  }
});
