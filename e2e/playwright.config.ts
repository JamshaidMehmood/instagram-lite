import { defineConfig, devices } from '@playwright/test';

import { API_PORT, API_URL, WEB_PORT, WEB_URL, TEST_DB_NAME } from './support/env';

/**
 * The suite drives the real stack — a real Express server against a real
 * MongoDB, and the real CRA dev server — rather than a mocked API. A test that
 * passes against a stub only proves the stub agrees with itself; these prove
 * the two halves of the app actually agree with each other.
 *
 * Everything runs on its own ports and its own database name, so a developer's
 * `npm run dev` on :5000/:3000 and their working data are never touched by a
 * test run. `npm run seed` in `globalSetup` resets that database, which is only
 * safe *because* it is a dedicated one.
 */
export default defineConfig({
  testDir: './tests',
  outputDir: './test-results',

  /**
   * One worker, no parallelism. Every spec shares one database, and the app is
   * built around mutable social state — a follow in one test changes another
   * test's feed. Isolating that would mean a database per worker, which is a
   * lot of machinery to buy back a few seconds on a suite this size.
   */
  fullyParallel: false,
  workers: 1,

  // A flake here means a real race in the app, so surface it rather than
  // papering over it locally. CI retries once to absorb infrastructure noise.
  retries: process.env['CI'] ? 1 : 0,

  // Guards against `test.only` reaching CI and silently skipping the suite.
  forbidOnly: Boolean(process.env['CI']),

  timeout: 45_000,
  expect: { timeout: 10_000 },

  reporter: process.env['CI']
    ? [['github'], ['html', { open: 'never' }]]
    : [['list'], ['html', { open: 'never' }]],

  use: {
    baseURL: WEB_URL,
    // Artefacts only for failures: a green run should not leave a gigabyte of
    // video behind.
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    actionTimeout: 10_000,
    navigationTimeout: 20_000,
  },

  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
    /**
     * The app has a genuinely different mobile layout — a bottom nav bar
     * instead of a sidebar, a centred profile header — so the mobile project
     * runs the navigation and layout specs rather than being a token
     * viewport change.
     */
    {
      name: 'mobile',
      testMatch: /(responsive|navigation)\.spec\.ts/,
      use: { ...devices['Pixel 7'] },
    },
  ],

  globalSetup: require.resolve('./support/globalSetup'),

  webServer: [
    {
      command: 'npm run dev --prefix ../Backend',
      port: API_PORT,
      reuseExistingServer: !process.env['CI'],
      timeout: 120_000,
      stdout: 'pipe',
      stderr: 'pipe',
      env: {
        PORT: String(API_PORT),
        MONGODB_DB_NAME: TEST_DB_NAME,
        // The dev CORS rule already allows any localhost port, but being
        // explicit means a production-mode run of this config still works.
        CORS_ORIGINS: WEB_URL,
        LOG_LEVEL: 'warn',
      },
    },
    {
      command: 'npm start --prefix ../post-application',
      port: WEB_PORT,
      reuseExistingServer: !process.env['CI'],
      // Create React App's first cold compile is slow, and a too-short timeout
      // here reads as a mysterious suite failure.
      timeout: 240_000,
      stdout: 'pipe',
      stderr: 'pipe',
      env: {
        PORT: String(WEB_PORT),
        BROWSER: 'none',
        // Points the SPA at the test API rather than whatever is on :5000.
        REACT_APP_API_URL: `${API_URL}/api/v1`,
        // CRA treats warnings as errors when CI is set, which would fail the
        // dev server on an unused import mid-refactor.
        CI: '',
      },
    },
  ],
});
