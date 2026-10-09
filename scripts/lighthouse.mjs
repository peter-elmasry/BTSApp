import lighthouse from 'lighthouse';
import { chromium } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
const port = 9223;
const chrome = await chromium.launch({ args: [`--remote-debugging-port=${port}`] });
try {
  const result = await lighthouse('http://127.0.0.1:4200/home', {
    port,
    output: ['json', 'html'],
    onlyCategories: ['accessibility', 'performance', 'best-practices'],
    screenEmulation: {
      mobile: true,
      width: 360,
      height: 740,
      deviceScaleFactor: 1,
      disabled: false,
    },
  });
  await mkdir('artifacts', { recursive: true });
  await writeFile('artifacts/lighthouse.json', result.report[0]);
  await writeFile('artifacts/lighthouse.html', result.report[1]);
  console.log(
    JSON.stringify(
      Object.fromEntries(
        Object.entries(result.lhr.categories).map(([key, value]) => [key, value.score]),
      ),
    ),
  );
  // Modern Lighthouse removed the PWA category. E2E verifies manifest/SW/offline separately.
  if (result.lhr.categories.accessibility.score < 0.9) process.exitCode = 1;
} finally {
  await chrome.close();
}
