import { defineConfig, devices } from '@playwright/test'

const PORT = Number(process.env.PLAYWRIGHT_PORT ?? 3100)
const BASE_URL = `http://localhost:${PORT}`

export default defineConfig({
  testDir: './tests/visual',
  outputDir: './tests/visual/.results',
  snapshotDir: './tests/visual/__screenshots__',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: 'list',
  use: {
    baseURL: BASE_URL,
    screenshot: 'only-on-failure',
  },
  // We pin every project to chromium so a single browser binary covers all
  // three viewports. The mobile/tablet device descriptors from Playwright
  // (iPhone 13 / iPad Mini) default to webkit, which would force a second
  // browser download — we explicitly override to chromium, then layer the
  // viewport + touch settings we actually care about on top.
  projects: [
    {
      name: 'mobile',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 375, height: 812 },
        deviceScaleFactor: 2,
        isMobile: true,
        hasTouch: true,
      },
    },
    {
      name: 'tablet',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 768, height: 1024 },
        deviceScaleFactor: 2,
        hasTouch: true,
      },
    },
    {
      name: 'desktop',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } },
    },
  ],
  webServer: {
    command: `PORT=${PORT} npm run dev -w web`,
    cwd: '..', // run from monorepo root so the workspace flag resolves
    url: BASE_URL,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
  expect: {
    toHaveScreenshot: {
      maxDiffPixelRatio: 0.005,
      animations: 'disabled',
    },
  },
})
