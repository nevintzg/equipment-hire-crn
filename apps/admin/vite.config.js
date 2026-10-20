import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

/**
 * In development the API is proxied under /api, so the refresh cookie is
 * first-party and SameSite=Lax works. In production set VITE_API_URL to the
 * API's origin (e.g. https://api.hire.example.org).
 */
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  return {
    plugins: [react()],
    server: {
      port: 5174,
      strictPort: true,
      proxy: {
        '/api': { target: env.API_PROXY_TARGET ?? 'http://localhost:4000', changeOrigin: false },
      },
    },
    preview: { port: 5174 },
  };
});
