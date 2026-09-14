import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: 'tests/extension',
  timeout: 45000,
  workers: 1,
  reporter: 'list',
  use: { trace: 'retain-on-failure' },
  webServer: { command: 'node scripts/fixture-server.mjs', port: 4173, reuseExistingServer: false },
});
