import react from '@vitejs/plugin-react';
// import basicSsl from '@vitejs/plugin-basic-ssl';
import { defineConfig } from 'vite';

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()
   //   basicSsl()
  ],
  server: {
    host: true, // 监听所有地址，包括局域网 IP
    port: 5173, // 指定端口
    allowedHosts: ['.ts.net'] // 允许所有 tailscale 域名访问
  },
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
