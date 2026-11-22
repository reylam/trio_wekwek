import path from 'node:path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
    },
  },
  // Wajib kecualikan onnxruntime-web agar Vite tidak menulis ulang loader .mjs/.wasm runtime-nya.
  optimizeDeps: {
    exclude: ['onnxruntime-web'],
  },
});
