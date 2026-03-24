import path from 'node:path'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from 'vite'

import { MANAGEMENT_BASE_PATH } from './src/types/management'

const localBackendTarget = process.env.COCKPIT_LOCAL_BACKEND_URL ?? 'http://127.0.0.1:8317'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    proxy: {
      '/api/provider': {
        target: localBackendTarget,
        changeOrigin: true,
        ws: true,
      },
      [MANAGEMENT_BASE_PATH]: {
        target: localBackendTarget,
        changeOrigin: true,
      },
      '/v1': {
        target: localBackendTarget,
        changeOrigin: true,
        ws: true,
      },
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
})
