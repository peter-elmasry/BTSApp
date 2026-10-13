import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  use: {
    baseURL: 'http://127.0.0.1:4200',
    viewport: { width: 360, height: 740 },
    trace: 'retain-on-failure',
    // Entry animations fade text in; axe must not sample a half-faded frame.
    contextOptions: { reducedMotion: 'reduce' },
  },
  webServer: {
    command: 'npm run serve:dist',
    url: 'http://127.0.0.1:4200',
    reuseExistingServer: !process.env['CI'],
  },
});
