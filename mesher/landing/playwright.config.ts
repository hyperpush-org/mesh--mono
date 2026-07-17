import { defineConfig, devices } from '@playwright/test'

const port = Number(process.env.PLAYWRIGHT_PORT ?? 3100)
const host = '127.0.0.1'
const baseURL = `http://${host}:${port}`

export default defineConfig({
  testDir: './tests',
  timeout: 30_000,
  expect: {
    timeout: 10_000,
  },
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  reporter: 'list',
  use: {
    baseURL,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
      },
    },
    {
      name: 'firefox-smoke',
      grep: /@smoke/,
      testMatch: /landing-surface\.spec\.ts/,
      use: {
        ...devices['Desktop Firefox'],
      },
    },
    {
      name: 'webkit-smoke',
      grep: /@smoke/,
      testMatch: /landing-surface\.spec\.ts/,
      use: {
        ...devices['Desktop Safari'],
      },
    },
    {
      name: 'mobile-chrome-smoke',
      grep: /@smoke/,
      testMatch: /landing-surface\.spec\.ts/,
      use: {
        ...devices['Pixel 7'],
      },
    },
    {
      name: 'mobile-safari-smoke',
      grep: /@smoke/,
      testMatch: /landing-surface\.spec\.ts/,
      use: {
        ...devices['iPhone 14'],
      },
    },
  ],
  webServer: {
    command: `npm run dev -- --hostname ${host} --port ${port}`,
    cwd: __dirname,
    env: {
      NEXT_PUBLIC_FORMSPREE_ID:
        process.env.NEXT_PUBLIC_FORMSPREE_ID ?? 'https://formspree.io/f/playwright-test',
    },
    port,
    timeout: 120_000,
    reuseExistingServer: !process.env.CI,
    stdout: 'pipe',
    stderr: 'pipe',
  },
})
