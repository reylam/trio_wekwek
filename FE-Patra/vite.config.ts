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
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules')) return undefined;
          if (id.includes('onnxruntime-web')) return 'vendor-onnx';
          if (id.includes('hls.js')) return 'vendor-hls';
          if (
            id.includes('recharts') ||
            id.includes('d3-') ||
            id.includes('victory-vendor')
          ) {
            return 'vendor-charts';
          }
          if (id.includes('leaflet')) return 'vendor-leaflet';
          if (id.includes('@tanstack/react-query')) return 'vendor-query';
          if (id.includes('lucide-react')) return 'vendor-icons';
          if (
            id.includes('react-dom') ||
            id.includes('react-router') ||
            /[\\/]node_modules[\\/]react[\\/]/.test(id)
          ) {
            return 'vendor-react';
          }
          return undefined;
        },
      },
    },
  },
  // Wajib kecualikan onnxruntime-web agar Vite tidak menulis ulang loader .mjs/.wasm runtime-nya.
  optimizeDeps: {
    exclude: ['onnxruntime-web'],
  },
});
