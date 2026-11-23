import os from 'node:os'
import path from 'node:path'
import { defineConfig } from '@playwright/test'

const artifactsRoot =
  process.env.PLAYWRIGHT_ARTIFACTS_DIR ||
  path.join(os.tmpdir(), 'dev-toolbox-playwright')

export default defineConfig({
  testDir: 'e2e',
  outputDir: path.join(artifactsRoot, 'test-results'),
  reporter: [
    ['list'],
    ['html', { outputFolder: path.join(artifactsRoot, 'playwright-report'), open: 'never' }]
  ],
  use: {
    browserName: 'chromium',
    launchOptions: {
      args: ['--allow-file-access-from-files']
    },
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure'
  },
  projects: [
    {
      name: 'chromium',
      use: {
        browserName: 'chromium'
      }
    }
  ]
})
