import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { eventId } from './public-fixtures';
import { mockStandingsEvent } from './standings-fixtures';

test.use({ serviceWorkers: 'block' });
const headers = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': '*',
  'access-control-allow-methods': '*',
};
for (const lang of ['en', 'ar'] as const) {
  const t = JSON.parse(readFileSync(`public/i18n/${lang}.json`, 'utf8'));
  test(`settings save confirms only after server acknowledgment in ${lang}`, async ({ page }) => {
    await mockStandingsEvent(page, { role: 'EVENT_ADMIN', lang });
    let release!: () => void;
    let received!: () => void;
    const gate = new Promise<void>((resolve) => (release = resolve));
    const request = new Promise<void>((resolve) => (received = resolve));
    await page.route('**/rest/v1/rpc/upsert_event_settings', async (route) => {
      if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers });
      received();
      await gate;
      return route.fulfill({ headers, json: {} });
    });
    await page.goto(`/manage/${eventId}/setup`);
    await page
      .locator('form')
      .first()
      .getByRole('button', { name: t.common.save, exact: true })
      .click();
    await request;
    await expect(page.getByTestId('toast')).toHaveCount(0);
    release();
    await expect(page.getByTestId('toast')).toHaveText(t.manage.saved);
    await page.getByRole('button', { name: t.common.dismiss, exact: true }).click();
    await expect(page.getByTestId('toast')).toHaveCount(0);
  });

  test(`failed settings save has an error and no success toast in ${lang}`, async ({ page }) => {
    await mockStandingsEvent(page, { role: 'EVENT_ADMIN', lang });
    await page.route('**/rest/v1/rpc/upsert_event_settings', (route) =>
      route.request().method() === 'OPTIONS'
        ? route.fulfill({ status: 204, headers })
        : route.fulfill({ status: 400, headers, json: { code: 'P0001', message: 'FORBIDDEN' } }),
    );
    await page.goto(`/manage/${eventId}/setup`);
    await page
      .locator('form')
      .first()
      .getByRole('button', { name: t.common.save, exact: true })
      .click();
    await expect(page.getByRole('status').filter({ hasText: t['errors.FORBIDDEN'] })).toBeVisible();
    await expect(page.getByTestId('toast')).toHaveCount(0);
  });

  test(`offline bulk saves say queued instead of completed in ${lang}`, async ({
    page,
    context,
  }) => {
    await mockStandingsEvent(page, { role: 'EVENT_ADMIN', lang });
    await page.goto(`/manage/${eventId}/setup`);
    await page.getByTestId('setup-step-teams').click();
    await page.getByTestId('bulk-teams').click();
    await page.getByTestId('bulk-count').fill('2');
    await context.setOffline(true);
    await page.getByTestId('bulk-confirm').click();
    await expect(page.getByTestId('toast')).toHaveText(t.live.queued);
    await expect(page.getByTestId('toast')).not.toHaveText(t.setup.bulkDone);
  });
}
