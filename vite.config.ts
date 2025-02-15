import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import dotenv from 'dotenv';

// Load environment variables before configuration
dotenv.config();

export default defineConfig({
  plugins: [react()],
  build: {
    outDir: 'dist/client',
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src')
    }
  },
  server: {
    port: parseInt((process.env.VITE_DEV_URL || 'http://localhost:5173').split(':')[2]),
    proxy: {
      '/api': {
        target: process.env.SERVER_URL || 'http://localhost:3001',
        changeOrigin: true
      },
      '/broadcast': {
        target: process.env.SERVER_URL || 'http://localhost:3001',
        changeOrigin: true
      },
      '/ws': {
        target: process.env.SERVER_URL || 'http://localhost:3001',
        changeOrigin: true,
        ws: true
      }
    }
  }
});
