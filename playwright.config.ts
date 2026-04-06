import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 120_000,
  retries: 0,
  // Run serially to avoid WS broadcast cross-contamination between tests
  workers: 1,
  use: {
    baseURL: 'http://localhost:5173',
    headless: true,
  },
  // Expect the dev server to already be running (npm run dev)
  webServer: undefined,
})
