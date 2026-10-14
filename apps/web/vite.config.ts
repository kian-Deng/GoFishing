import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const profilePath = fileURLToPath(new URL('./public/gofishing-dev-ca.mobileconfig', import.meta.url));
export default defineConfig({
  plugins: [
    vue(),
    {
      name: 'local-dev-certificate-profile',
      configureServer(server) {
        server.middlewares.use('/gofishing-dev-ca.mobileconfig', (_req, res, next) => {
          if (!existsSync(profilePath)) return next();
          res.setHeader('Content-Type', 'application/x-apple-aspen-config');
          res.end(readFileSync(profilePath));
        });
      },
    },
  ],
  server: { port: 5173, proxy: { '/api': { target: 'http://127.0.0.1:3100', changeOrigin: false } } },
  build: { sourcemap: false },
});
