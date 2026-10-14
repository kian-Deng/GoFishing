import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { mergeConfig } from 'vite';
import baseConfig from './vite.config';

const certPath = fileURLToPath(new URL('../../dev-certs/', import.meta.url));

export default mergeConfig(baseConfig, {
  server: {
    host: '0.0.0.0',
    port: 5175,
    strictPort: true,
    https: {
      key: readFileSync(`${certPath}server.key`),
      cert: readFileSync(`${certPath}server.crt`),
    },
  },
});
