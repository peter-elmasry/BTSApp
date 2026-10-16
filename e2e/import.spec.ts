import { expect, test } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
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
      let body: unknown = null;
      if (path.endsWith('/server_now')) body = new Date().toISOString();
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
    await mkdir('artifacts', { recursive: true });
    await writeFile(`artifacts/import-template-${lang}.xlsx`, buffer);
    const ExcelJS = (await import('exceljs')).default;
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer);
    // Realistic edited workbook: show one local error, with no duplicate server cascade.
    const teams = workbook.getWorksheet('الفرق')!;
    teams.getCell('C5').value = teams.getCell('C4').value;
    await page.locator('input[type=file]').setInputFiles({
      name: 'needs-correction.xlsx',
      mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      buffer: Buffer.from(await workbook.xlsx.writeBuffer()),
    });
    await expect(page.getByText(labels.issue.DUPLICATE_COLOR, { exact: true })).toBeVisible();
    expect(calls).toHaveLength(0);
    await expect(
      page.getByRole('button', { name: labels.reviewImport, exact: true }),
    ).toBeDisabled();
    // Correct the file and exercise spelling resolution, blank emblem/half-heart defaults,
    // and a visible warning about importing a workbook exported from another event.
    teams.getCell('C5').value = 'أزرق';
    teams.getCell('B4').value = 'إسماعيل يس';
    teams.getCell('D4').value = null;
    workbook.getWorksheet('الألعاب')!.getCell('B4').value = 'لعبة';
    const schedule = workbook.getWorksheet('الجدول')!;
    schedule.getCell('C5').value = 20;
    schedule.getCell('D5').value = 'اسماعيل يس';
    schedule.getCell('E5').value = teams.getCell('B5').value;
    const settings = workbook.getWorksheet('الحدث')!;
    settings.getCell('B6').value = null;
    settings.getCell('B14').value = 'قلوب';
    settings.getCell('B15').value = 7;
    workbook.getWorksheet('_meta')!.getCell('B2').value = 'OTHER-EVENT';
    await page.locator('input[type=file]').setInputFiles({
      name: 'setup.xlsx',
      mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      buffer: Buffer.from(await workbook.xlsx.writeBuffer()),
    });
    await expect.poll(() => calls.filter((call) => call.p_dry_run).length).toBe(1);
    const review = page.getByRole('button', { name: labels.reviewImport, exact: true });
    await expect(review).toBeEnabled();
    await expect(page.getByTestId('import-target')).toContainText('IMPORT-DEMO');
    await page.getByText(labels.automaticFixes, { exact: false }).click();
    await expect(page.getByText(labels.defaultAvatarsWarning, { exact: true })).toBeVisible();
    await expect(page.getByText(labels.normalizedNamesWarning, { exact: true })).toBeVisible();
    await expect(page.getByText(labels.halfDrawWarning, { exact: true })).toBeVisible();
    await expect(
      page.getByText(
        labels.sourceEventWarning
          .replace('{{source}}', 'OTHER-EVENT')
          .replace('{{target}}', 'IMPORT-DEMO'),
        { exact: true },
      ),
    ).toBeVisible();
    expect(calls.filter((call) => !call.p_dry_run)).toHaveLength(0);
    expect(calls[0].p_payload.teams).toHaveLength(20);
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
