import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { imagetools } from 'vite-imagetools';

export default defineConfig({
  plugins: [imagetools(), react()],
  server: {
    port: 5173,
    proxy: {
      '/api': {
        // Must match Lighthouse.API http URL in Properties/launchSettings.json (default profile uses 5029).
        target: 'http://localhost:5029',
        changeOrigin: true,
      },
    },
  },
});
