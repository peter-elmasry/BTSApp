import { expect, test } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { readFileSync } from 'node:fs';
import { mockAudio, starts } from './audio-fixtures';
test.use({ serviceWorkers: 'block' });

for (const lang of ['en', 'ar'] as const) {
  test(`administrator tests with a muted guest and recovers without broadcasts in ${lang}`, async ({
    page,
    browser,
  }) => {
    const labels = JSON.parse(readFileSync(`public/i18n/${lang}.json`, 'utf8')).audio;
    await mockAudio(page, lang, false, true, 'EVENT_ADMIN');
    const context = await browser.newContext({
      serviceWorkers: 'block',
      viewport: { width: 360, height: 740 },
    });
    const guest = await context.newPage();
    await mockAudio(guest, lang);
    let marker: { id: string; occurredAt: string } | null = null;
    const reads = new Map([
      [page, 0],
      [guest, 0],
    ]);
    const headers = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*' };
    for (const viewer of [page, guest]) {
      await viewer.route('**/rest/v1/rpc/get_notification_test', (route) => {
        reads.set(viewer, reads.get(viewer)! + 1);
        return route.fulfill({
          headers,
          json: { serverNow: new Date().toISOString(), test: marker },
        });
      });
      await viewer.route('**/rest/v1/rpc/get_event_update_token', (route) =>
        route.fulfill({ headers, json: marker?.id ?? 'initial' }),
      );
    }
    let sends = 0;
    await page.route('**/rest/v1/rpc/test_event_notifications', (route) => {
      sends++;
      marker = { id: crypto.randomUUID(), occurredAt: new Date().toISOString() };
      return route.fulfill({ headers, json: { ...marker, devices: 2 } });
    });
    try {
      await page.goto('/choose-team');
      await page.getByRole('button', { name: labels.enable, exact: true }).click();
      await guest.goto('/choose-team');
      await guest.getByRole('button', { name: labels.keepMuted, exact: true }).click();
      await expect.poll(() => reads.get(page)).toBeGreaterThan(0);
      await expect.poll(() => reads.get(guest)).toBeGreaterThan(0);
      await expect(guest.getByRole('button', { name: labels.sharedTest, exact: true })).toHaveCount(
        0,
      );
      await page.getByTestId('audio-options').locator('summary').click();
      const send = page.getByRole('button', { name: labels.sharedTest, exact: true });
      await expect(send).toBeVisible();
      await expect(page.getByRole('button', { name: labels.test, exact: true })).toBeVisible();
      const localBox = await page
        .getByRole('button', { name: labels.test, exact: true })
        .boundingBox();
      const sharedBox = await send.boundingBox();
      expect(Math.abs(localBox!.y - sharedBox!.y)).toBeLessThan(2);
      expect(
        (await new AxeBuilder({ page }).include('[data-testid="audio-controls"]').analyze())
          .violations,
      ).toEqual([]);
      await page.screenshot({ path: `artifacts/shared-test-${lang}.png`, fullPage: true });
      await send.click();
      await expect(send).toBeDisabled();
      await expect(guest.getByTestId('toast')).toHaveText(labels.sharedReceived, { timeout: 8000 });
      expect(sends).toBe(1);
      expect(await starts(guest)).toHaveLength(0);
      await expect.poll(() => starts(page)).toHaveLength(1);
      await expect(
        page.getByText(labels.sharedSent.replace('{{n}}', '2'), { exact: true }),
      ).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(
        false,
      );
    } finally {
      await context.close();
    }
  });
}
