import { expect, test } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { readFile } from 'node:fs/promises';
import { readFileSync } from 'node:fs';

// Keep RPC mocks on the page request path; the shell suite verifies the real service worker.
test.use({ serviceWorkers: 'block' });

const eventId = '33000000-0000-0000-0000-000000000001';
const counts = { teams: 2, games: 1, rounds: 1, matches: 1, staff: 0 };
const event = {
  id: eventId,
  code: 'IMPORT-DEMO',
  name_en: 'Import demo',
  points_win: 2,
  points_draw: 1,
  points_loss: 0,
  currency_en_one: 'Point',
  currency_en_other: 'Points',
  currency_ar_one: 'نقطة',
  currency_ar_two: 'نقطتين',
  currency_ar_plural: 'نقط',
};

for (const lang of ['en', 'ar']) {
  test(`XLSX template, preview and explicit import at 360px in ${lang}`, async ({ page }) => {
    const labels = JSON.parse(readFileSync(`public/i18n/${lang}.json`, 'utf8'))['import'];
    const calls: { p_dry_run: boolean; p_payload: { teams: unknown[] }; p_op_id: string }[] = [];
    await page.addInitScript(
      ({ lang }) => {
        localStorage.setItem('bts.lang', lang);
        localStorage.setItem(
          'sb-127-auth-token',
          JSON.stringify({
            access_token: 'test-access-token',
            refresh_token: 'test-refresh-token',
            expires_at: Math.floor(Date.now() / 1000) + 3600,
            token_type: 'bearer',
            user: { id: 'test-user', aud: 'authenticated', role: 'authenticated' },
          }),
        );
      },
      { lang },
    );
    await page.route('http://127.0.0.1:54321/**', async (route) => {
      const headers = {
        'access-control-allow-origin': '*',
        'access-control-allow-headers': '*',
        'access-control-allow-methods': '*',
      };
      if (route.request().method() === 'OPTIONS') {
        await route.fulfill({ status: 204, headers });
        return;
      }
      const path = new URL(route.request().url()).pathname;
      let body: unknown = {};
      if (path.endsWith('/get_my_profile'))
        body = {
          id: 'test-member',
          username: 'import_owner',
          full_name_en: 'Import Owner',
          system_role: 'OWNER',
          roles: [],
          assigned_games: [],
        };
      if (path.endsWith('/get_event_setup'))
        body = {
          event,
          teams: [],
          games: [],
          rounds: [],
          matches: [],
          roles: [],
          referee_games: [],
          eligible_members: [],
        };
      if (path.endsWith('/import_event_setup')) {
        const call = route.request().postDataJSON();
        calls.push(call);
        body = { valid: true, errors: [], counts, applied: !call.p_dry_run };
      }
      await route.fulfill({ status: 200, headers, json: body });
    });
    await page.goto(`/manage/${eventId}/import`);
    const downloadButton = page.getByRole('button', { name: labels.downloadTemplate, exact: true });
    await expect(downloadButton).toBeVisible();
    const downloadPromise = page.waitForEvent('download');
    await downloadButton.click();
    const download = await downloadPromise;
    const buffer = await readFile((await download.path())!);
    await page.locator('input[type=file]').setInputFiles({
      name: 'setup.xlsx',
      mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      buffer,
    });
    await expect.poll(() => calls.filter((call) => call.p_dry_run).length).toBe(1);
    const review = page.getByRole('button', { name: labels.reviewImport, exact: true });
    await expect(review).toBeEnabled();
    expect(calls.filter((call) => !call.p_dry_run)).toHaveLength(0);
    expect(calls[0].p_payload.teams).toHaveLength(2);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
    await review.click();
    await expect(page.locator('dialog')).toBeVisible();
    await page.locator('dialog').getByRole('button', { name: labels.confirm, exact: true }).click();
    await expect.poll(() => calls.filter((call) => !call.p_dry_run).length).toBe(1);
    await expect(page.locator('dialog')).toHaveCount(0);
    await expect(page.getByRole('link', { name: labels.reviewSetup, exact: true })).toBeFocused();
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({ path: `artifacts/import-${lang}.png`, fullPage: true });
  });
}
