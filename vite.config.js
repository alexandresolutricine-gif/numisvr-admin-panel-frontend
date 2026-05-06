import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { nodePolyfills } from 'vite-plugin-node-polyfills';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  console.log("env.PORT", env.PORT);
  return {
    plugins: [
      react(),
      tailwindcss(),
      nodePolyfills({ include: ['buffer', 'process', 'crypto'] }),
    ],
    define: {
      'process.env': {},
      global: 'globalThis',
    },
    server: {
      host: '0.0.0.0',
      port: parseInt(env.PORT) || 3004,
      allowedHosts: ['admin.numisvr.com']
    },
  };
});
