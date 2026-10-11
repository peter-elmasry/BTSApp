import { expect, test } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { readFileSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { eventId } from './public-fixtures';
import { mockStandingsEvent } from './standings-fixtures';

test.use({ serviceWorkers: 'block' });

test('Arabic setup renders choose, delete and remove labels instead of translation keys', async ({
  page,
}) => {
  const t = JSON.parse(readFileSync('public/i18n/ar.json', 'utf8'));
  await mockStandingsEvent(page, { role: 'EVENT_ADMIN', lang: 'ar' });
  await page.goto(`/manage/${eventId}/setup`);
  await page.getByRole('button', { name: t.manage.tab.rounds, exact: true }).click();
  expect(
    await page.getByRole('option', { name: t.common.choose, exact: true }).count(),
  ).toBeGreaterThan(0);
  await page.getByRole('button', { name: t.manage.tab.staff, exact: true }).click();
  await expect(
    page.getByRole('button', { name: t.common.remove, exact: true }).first(),
  ).toBeVisible();
  await page.getByRole('button', { name: t.manage.tab.teams, exact: true }).click();
  await expect(
    page.getByRole('button', { name: t.common.delete, exact: true }).first(),
  ).toBeVisible();
  await expect(page.locator('main').last()).not.toContainText(/common\.(remove|delete|choose)/);
});

test('live scoring settings warn about recalculation and reuse Arabic currency rules', async ({
  page,
}) => {
  const t = JSON.parse(readFileSync('public/i18n/en.json', 'utf8')).phase6;
  const fixture = await mockStandingsEvent(page, { role: 'EVENT_ADMIN' });
  await page.goto(`/manage/${eventId}/setup`);
  await expect(page.getByText(t.pointsWarning, { exact: true })).toBeVisible();
  await page.locator('#currency-count').fill('11');
  await expect(page.locator('#currency-count + p')).toHaveText(
    `11 ${fixture.snapshot.event.currency_ar_one}`,
  );
  await page.locator('#currency-count').fill('2');
  await expect(page.locator('#currency-count + p')).toHaveText(
    `2 ${fixture.snapshot.event.currency_ar_two}`,
  );
});

test('draft scoring settings do not show the live recalculation warning', async ({ page }) => {
  const t = JSON.parse(readFileSync('public/i18n/en.json', 'utf8')).phase6;
  const fixture = await mockStandingsEvent(page, { role: 'EVENT_ADMIN' });
  fixture.snapshot.event.status = 'DRAFT';
  await page.goto(`/manage/${eventId}/setup`);
  await expect(page.locator('#currency-count')).toBeVisible();
  await expect(page.getByText(t.pointsWarning, { exact: true })).toHaveCount(0);
});

for (const lang of ['en', 'ar'] as const) {
  test(`admin confirms ties and visibility, then exports the exact frozen preview in ${lang}`, async ({
    page,
  }) => {
    test.setTimeout(60000);
    const t = JSON.parse(readFileSync(`public/i18n/${lang}.json`, 'utf8')).phase6;
    const fixture = await mockStandingsEvent(page, { role: 'EVENT_ADMIN', lang });
    fixture.exportData.adjustments.push({
      id: 'export-adjustment',
      team_code: 'T01',
      team_name_en: 'Falcons',
      team_name_ar: 'الصقور',
      scope: 'MATCH',
      match_id: fixture.exportData.matches[0].id,
      points: -1,
      reason: '=SUM(1,2)',
      given_by: { name_en: 'Mina Referee', name_ar: 'مينا الحكم' },
      created_at: '2026-10-10T12:00:00Z',
      revoked_at: '2026-10-10T12:01:00Z',
      revoke_reason: 'Correction',
    });
    const original = fixture.rows.map((row) => row.team);
    const firstTeam = original[1];
    const firstName = lang === 'ar' ? (firstTeam.name_ar ?? firstTeam.name_en) : firstTeam.name_en;
    await page.goto(`/manage/${eventId}/standings`);

    await page.getByRole('button', { name: t.resolveTie, exact: true }).click();
    await expect(page.locator('dialog')).toBeVisible();
    expect(fixture.calls.filter((call) => call.name === 'set_tiebreak')).toHaveLength(0);
    const upLabel = t.moveUpTeam.replace(/{{\s*name\s*}}/g, firstName);
    await page.getByRole('button', { name: upLabel, exact: true }).click();
    await expect(page.locator('dialog ol li').first()).toContainText(firstName);
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
    await page.getByTestId('confirm-standings-action').click();
    await expect
      .poll(() => fixture.calls.filter((call) => call.name === 'set_tiebreak').length)
      .toBe(1);
    const tie = fixture.calls.find((call) => call.name === 'set_tiebreak')!;
    expect(tie.args.p_team_ids).toEqual([original[1].id, original[0].id]);
    expect(new Set(tie.args.p_team_ids).size).toBe(original.length);
    expect(tie.args.p_op_id).toMatch(/^[0-9a-f-]{36}$/i);
    await expect(
      page.getByTestId('admin-standings-table').locator('tbody tr').first(),
    ).toHaveAttribute('data-team-code', firstTeam.code);
    await expect(page.getByRole('button', { name: t.resolveTie, exact: true })).toHaveCount(0);

    await page.getByRole('button', { name: t.hide, exact: true }).click();
    await expect(page.locator('dialog')).toContainText(t.hideConfirm);
    expect(fixture.snapshot.event.leaderboard_public).toBe(true);
    expect(fixture.calls.filter((call) => call.name === 'set_leaderboard_visibility')).toHaveLength(
      0,
    );
    await page.getByTestId('confirm-standings-action').click();
    await expect
      .poll(() => fixture.calls.filter((call) => call.name === 'set_leaderboard_visibility').length)
      .toBe(1);
    const visibility = fixture.calls.find((call) => call.name === 'set_leaderboard_visibility')!;
    expect(visibility.args.p_public).toBe(false);
    expect(fixture.snapshot.event.leaderboard_public).toBe(false);
    await expect(page.getByRole('button', { name: t.publish, exact: true })).toBeEnabled();
    await expect(page.getByTestId('admin-standings-table').locator('tbody tr')).toHaveCount(2);

    await page.getByRole('button', { name: t.prepareExport, exact: true }).click();
    await expect(page.getByRole('heading', { name: t.exportPreview, exact: true })).toBeVisible();
    await expect(page.getByTestId('download-standings')).toBeEnabled();
    const displayed = await page
      .getByTestId('admin-standings-table')
      .locator('tbody tr')
      .evaluateAll((rows) =>
        rows.map((row) => ({
          code: row.getAttribute('data-team-code'),
          rank: Number(row.children[0].textContent?.trim()),
          values: Array.from(row.children)
            .slice(2, 10)
            .map((cell) => Number(cell.textContent?.trim())),
        })),
      );
    // The server can move ahead after preview. Download must use the displayed
    // snapshot rather than fetching a newer table behind the user's back.
    fixture.rows.reverse();
    fixture.rows[0].total = 999;
    const downloading = page.waitForEvent('download');
    await page.getByTestId('download-standings').click();
    const download = await downloading;
    expect(download.suggestedFilename()).toBe('DST-PLAY-standings-20261010-1501.xlsx');
    const ExcelJS = (await import('exceljs')).default;
    const workbook = await new ExcelJS.Workbook().xlsx.load(
      await readFile((await download.path())!),
    );
    expect(workbook.worksheets.map((sheet) => sheet.name)).toEqual([
      'Standings',
      'Matches',
      'Adjustments',
      'Staff',
    ]);
    const standings = workbook.getWorksheet('Standings')!;
    for (const [index, expected] of displayed.entries()) {
      const row = standings.getRow(index + 4);
      expect(row.getCell(1).value).toBe(expected.rank);
      expect(row.getCell(2).value).toBe(expected.code);
      expect(Array.from({ length: 8 }, (_, column) => row.getCell(column + 5).value)).toEqual(
        expected.values,
      );
      expect(typeof row.getCell(12).value).toBe('number');
    }
    expect(standings.views[0].rightToLeft).toBe(lang === 'ar');
    expect(workbook.getWorksheet('Matches')!.getCell('K4').value).toBe('Mina Referee');
    const adjustments = workbook.getWorksheet('Adjustments')!;
    expect(adjustments.getCell('F4').value).toBe(-1);
    expect(adjustments.getCell('G4').value).toBe('=SUM(1,2)');
    expect(adjustments.getCell('G4').type).toBe(ExcelJS.ValueType.String);
    expect(adjustments.getCell('H4').value).toBe('Mina Referee');
    expect(adjustments.getCell('K4').value).toBe(true);
    expect(adjustments.getCell('M4').value).toBe('Correction');
    expect(JSON.stringify(workbook.model)).not.toContain('live-member');
    await expect(
      page.getByTestId('admin-standings-table').getByTestId('standing-total'),
    ).toHaveText(displayed.map((row) => String(row.values[7])));
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({ path: `artifacts/standings-admin-${lang}.png`, fullPage: true });
  });
}
