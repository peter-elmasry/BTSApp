import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { mockOwner } from './owner-fixtures';
import { mockLiveEvent } from './live-fixtures';
import { mockPublicEvent } from './public-fixtures';
import { environment } from '../src/environments/environment';

test.use({ serviceWorkers: 'block' });
for (const lang of ['en', 'ar'] as const) {
  test(`owners see the loaded build identity in the account menu in ${lang}`, async ({ page }) => {
    await mockOwner(page, lang);
    const t = JSON.parse(readFileSync(`public/i18n/${lang}.json`, 'utf8'));
    await page.goto('/owner/members');
    await page.getByTestId('account-menu').click();
    const info = page.getByTestId('release-info');
    await expect(info).toContainText(t['release.label']);
    await expect(page.getByTestId('release-version')).toHaveText(environment.release.version);
    await expect(info).toContainText(t['release.' + environment.release.environment]);
    if (environment.release.version !== environment.release.commit) {
      await expect(page.getByTestId('release-commit')).toHaveText(environment.release.commit);
    }
    await expect(info.locator('bdi').first()).toHaveAttribute('dir', 'ltr');
    await page.screenshot({ path: `artifacts/owner-release-${lang}.png`, fullPage: true });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
  });
}
for (const role of ['REFEREE', 'EVENT_ADMIN'] as const) {
  test(`release information is absent for ${role}`, async ({ page }) => {
    await mockLiveEvent(page, { role });
    await page.goto('/home');
    await page.getByTestId('account-menu').click();
    await expect(page.getByTestId('staff-menu')).toBeVisible();
    await expect(page.getByTestId('release-info')).toHaveCount(0);
  });
}
test('release information is absent for guests', async ({ page }) => {
  await mockPublicEvent(page);
  await page.goto('/home');
  await expect(page.locator('app-shell main')).toBeVisible();
  await expect(page.getByTestId('release-info')).toHaveCount(0);
  await expect(page.getByTestId('account-menu')).toHaveCount(0);
});
