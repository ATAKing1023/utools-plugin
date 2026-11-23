import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'
import vue from '@vitejs/plugin-vue'

const testUtilsEsm = fileURLToPath(
  new URL(
    './node_modules/@vue/test-utils/dist/vue-test-utils.esm-bundler.mjs',
    import.meta.url
  )
)

export default defineConfig({
  plugins: [vue()],
  resolve: {
    alias: {
      '@vue/test-utils': testUtilsEsm,
      '@vue/server-renderer': 'vue/server-renderer'
    }
  },
  test: {
    environment: 'jsdom',
    include: ['src/**/*.spec.js'],
    server: {
      deps: {
        inline: [/@vue\/test-utils/]
      }
    },
    setupFiles: ['./src/test/setup.js']
  }
})
