import react from '@vitejs/plugin-react';
import { loadEnv } from 'vite';
import { defineConfig } from 'vitest/config';

const DEFAULT_CLIENT_PORT = 5173;
const DEFAULT_API_PROXY_TARGET = 'http://localhost:8787';

// Only CLIENT_PORT and API_PROXY_TARGET are read. The generic PORT variable is ignored on purpose.
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const clientPort = Number(env.CLIENT_PORT) || DEFAULT_CLIENT_PORT;
  const proxy = {
    '/api': { target: env.API_PROXY_TARGET || DEFAULT_API_PROXY_TARGET, changeOrigin: false },
  };

  return {
    plugins: [react()],
    server: { port: clientPort, strictPort: true, proxy },
    preview: { port: clientPort, strictPort: true, proxy },
    test: {
      environment: 'jsdom',
      globals: false,
      setupFiles: ['./tests/setup.ts'],
      include: ['tests/**/*.test.{ts,tsx}'],
      coverage: {
        provider: 'v8',
        include: ['src/**/*.{ts,tsx}'],
        exclude: ['src/main.tsx', 'src/api/schema.d.ts', 'src/vite-env.d.ts'],
      },
    },
  };
});
