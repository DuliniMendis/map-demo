import { defineConfig, devices } from '@playwright/test';

// E2E suite (WS6). Runs against the production build served by `vite preview`; build it first with
// `pnpm build:e2e` (or use `pnpm test:e2e`, which does both). See docs/qa.md.

const PORT = Number(process.env.E2E_PORT ?? 4206);
// WS2's camera.spec drives its dev page (src/map/controller/dev.html), which only the dev server serves.
const DEV_PORT = Number(process.env.E2E_DEV_PORT ?? 4207);
const BASE_URL = process.env.E2E_BASE_URL ?? `http://127.0.0.1:${PORT}`;
const CI = Boolean(process.env.CI);

// WebGL without a GPU: Linux CI runners have none, so use ANGLE's SwiftShader software rasteriser
// (Chrome only allows it for WebGL with --enable-unsafe-swiftshader). macOS uses Metal.
const webglArgs =
  process.platform === 'darwin'
    ? ['--use-gl=angle', '--use-angle=metal', '--ignore-gpu-blocklist']
    : [
        '--use-gl=angle',
        '--use-angle=swiftshader',
        '--enable-unsafe-swiftshader',
        '--ignore-gpu-blocklist',
      ];

// Outputs live under node_modules/.cache so git, Prettier and ESLint never see them.
const OUT = 'node_modules/.cache/playwright';

export default defineConfig({
  testDir: 'tests/playwright',
  testMatch: '**/*.spec.ts',
  outputDir: `${OUT}/test-results`,
  // Visual baselines are committed for Linux only (CI). See docs/qa.md "Visual baselines".
  snapshotPathTemplate:
    '{testDir}/__screenshots__/{testFilePath}/{arg}-{projectName}-{platform}{ext}',
  // On CI a missing baseline is a failure (the actual image lands in the report for review);
  // regenerate deliberately with --update-snapshots (workflow_dispatch input `update_snapshots`).
  updateSnapshots: CI ? 'none' : 'missing',
  fullyParallel: true,
  forbidOnly: CI,
  retries: CI ? 1 : 0,
  workers: CI ? 2 : undefined,
  // CI renders WebGL in software (SwiftShader): every test is 3–5× slower than on a laptop GPU.
  timeout: CI ? 90_000 : 30_000,
  expect: {
    timeout: CI ? 30_000 : 10_000,
    toHaveScreenshot: { maxDiffPixelRatio: 0.02, animations: 'disabled', caret: 'hide' },
  },
  reporter: [
    ['list'],
    ['html', { outputFolder: `${OUT}/report`, open: 'never' }],
    ...(CI ? ([['github']] as const) : []),
  ],
  use: {
    baseURL: BASE_URL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    locale: 'en-AU',
    timezoneId: 'Australia/Sydney',
    colorScheme: 'light',
  },
  projects: [
    {
      name: 'chromium',
      testIgnore: 'camera.spec.ts',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 1280, height: 800 },
        launchOptions: { args: webglArgs },
      },
    },
    {
      name: 'camera-dev',
      testMatch: 'camera.spec.ts',
      use: {
        ...devices['Desktop Chrome'],
        baseURL: `http://127.0.0.1:${DEV_PORT}`,
        viewport: { width: 1280, height: 800 },
        launchOptions: { args: webglArgs },
      },
    },
  ],
  webServer: [
    ...(process.env.E2E_BASE_URL
      ? []
      : [
          {
            // Serves dist/ as built by `pnpm build:e2e`. Port 4206 is WS6's reserved local preview port.
            command: `pnpm exec vite preview --host 127.0.0.1 --port ${PORT} --strictPort`,
            url: BASE_URL,
            reuseExistingServer: !CI,
            timeout: 30_000,
          },
        ]),
    {
      command: `pnpm exec vite --host 127.0.0.1 --port ${DEV_PORT} --strictPort`,
      url: `http://127.0.0.1:${DEV_PORT}/src/map/controller/dev.html`,
      reuseExistingServer: !CI,
      timeout: 60_000,
    },
  ],
});
