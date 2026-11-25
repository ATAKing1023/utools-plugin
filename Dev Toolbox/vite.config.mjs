import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

export const DEV_SERVER_PORT = 5219

export default defineConfig({
  plugins: [vue()],
  base: './',
  server: {
    host: '127.0.0.1',
    port: DEV_SERVER_PORT,
    strictPort: true
  },
  build: {
    target: 'chrome132'
  }
})
