import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  build: {
    chunkSizeWarningLimit: 600,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules')) return undefined;
          if (/[\\/]node_modules[\\/](react|react-dom)[\\/]/.test(id)) {
            return 'vendor-react';
          }
          if (id.includes('@dnd-kit')) {
            return 'vendor-dnd';
          }
          if (/[\\/]node_modules[\\/](gsap|@gsap[\\/]react)[\\/]/.test(id)) {
            return 'vendor-gsap';
          }
          return undefined;
        },
      },
    },
  },
});
