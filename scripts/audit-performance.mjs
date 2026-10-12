import { chromium } from '@playwright/test';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
const fixtureCode = ts.transpileModule(readFileSync('e2e/public-fixtures.ts', 'utf8'), {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
}).outputText;
const fixture = {};
vm.runInNewContext(fixtureCode, { exports: fixture, structuredClone, Date, URL, console });
const baseURL = process.env.BTS_AUDIT_URL ?? 'http://127.0.0.1:4200';
if (!['localhost', '127.0.0.1'].includes(new URL(baseURL).hostname))
  throw new Error('Audit is restricted to a local preview');
const browser = await chromium.launch();
const results = [];
try {
  for (const lang of ['en', 'ar']) {
    const context = await browser.newContext({
      viewport: { width: 390, height: 844 },
      isMobile: true,
      hasTouch: true,
      serviceWorkers: 'block',
    });
    const page = await context.newPage();
    await fixture.mockPublicEvent(page);
    await page.addInitScript((language) => localStorage.setItem('bts.lang', language), lang);
    const cdp = await context.newCDPSession(page);
    await cdp.send('Network.enable');
    await cdp.send('Network.setCacheDisabled', { cacheDisabled: true });
    await cdp.send('Network.emulateNetworkConditions', {
      offline: false,
      latency: 400,
      downloadThroughput: 1600000 / 8,
      uploadThroughput: 750000 / 8,
      connectionType: 'cellular3g',
    });
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
    const start = performance.now();
    await page.goto(baseURL + '/home', { waitUntil: 'domcontentloaded', timeout: 90000 });
    await page.getByTestId('team-card-T01').waitFor({ timeout: 90000 });
    const readyMs = Math.round(performance.now() - start);
    const metrics = await page.evaluate(() => ({
      paint: performance
        .getEntriesByType('paint')
        .map((p) => ({ name: p.name, startTime: p.startTime })),
      resources: performance.getEntriesByType('resource').length,
    }));
    results.push({ lang, readyMs, targetMs: 4000, belowTarget: readyMs < 4000, ...metrics });
    await context.close();
  }
} finally {
  await browser.close();
}
const report = {
  profile: {
    latencyMs: 400,
    downloadBitsPerSecond: 1600000,
    uploadBitsPerSecond: 750000,
    cpuSlowdown: 4,
    viewport: '390x844',
    backend: 'mocked public event',
    serviceWorker: 'blocked',
    server: 'local uncompressed production assets',
  },
  results,
};
mkdirSync('artifacts', { recursive: true });
writeFileSync('artifacts/audit-performance.json', JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));

if (results.some((result) => !result.belowTarget)) process.exitCode = 1;
