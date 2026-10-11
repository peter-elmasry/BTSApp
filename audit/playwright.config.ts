import { defineConfig } from '@playwright/test';

const baseURL = process.env['BTS_AUDIT_URL'] ?? 'http://127.0.0.1:4200';
if (!['localhost', '127.0.0.1'].includes(new URL(baseURL).hostname))
  throw new Error('Audit is restricted to a local preview');

export default defineConfig({
  testDir: '.',
  testMatch: 'requirements.spec.ts',
  workers: 1,
  timeout: 60000,
  expect: { timeout: 7000 },
  use: {
    baseURL,
    viewport: { width: 360, height: 740 },
    trace: 'retain-on-failure',
  },
});
