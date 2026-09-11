import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// https://vitejs.dev/config/
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
      '/api/v1': {
        target: 'http://127.0.0.1:4000',
        changeOrigin: true,
        configure: (proxy, _options) => {
          proxy.on('error', (err, _req, _res) => {
            console.log('proxy error', err);
          });
          proxy.on('proxyReq', (proxyReq, req, _res) => {
            console.log('Sending Request to the Target:', req.method, req.url);
          });
          proxy.on('proxyRes', (proxyRes, req, _res) => {
            console.log('Received Response from the Target:', proxyRes.statusCode, req.url);
          });
        },
      },
    },
  },
  // Production: Railway's Start Command runs `npm run preview` (this
  // block), not `npm run dev` (the `server` block above, unaffected).
  // host: true binds to all network interfaces - Railway's proxy sits in
  // front of the container and can't reach a localhost-only bind (the
  // earlier 502). allowedHosts is required separately since Vite 5:
  // without it, `vite preview` rejects any request whose Host header
  // isn't localhost with "Blocked request. This host is not allowed".
  // The wildcard covers any Railway-generated subdomain so this doesn't
  // need updating if the domain ever regenerates; the current exact
  // domain is also listed for clarity/documentation.
  preview: {
    host: true,
    allowedHosts: [
      'budget-drive-production.up.railway.app',
      '.up.railway.app',
    ],
  },
});
