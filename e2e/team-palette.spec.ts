import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { mockOwner } from './owner-fixtures';
import { eventId } from './public-fixtures';
test.use({ serviceWorkers: 'block' });
const headers = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': '*',
  'access-control-allow-methods': '*',
};
for (const lang of ['en', 'ar'] as const) {
  test(`named HEX colour saves and is reusable in ${lang}`, async ({ page }) => {
    await mockOwner(page, lang);
    const labels = JSON.parse(readFileSync(`public/i18n/${lang}.json`, 'utf8'));
    const event = {
      id: eventId,
      code: 'PAL',
      name_en: 'Palette',
      team_palette: [] as { name: string; hex: string }[],
    };
    let savedHex = '';
    await page.route('**/rest/v1/rpc/get_event_setup', (route) =>
      route.fulfill({ headers, json: { event, teams: [], games: [], rounds: [] } }),
    );
    await page.route('**/rest/v1/rpc/set_team_palette', (route) => {
      if (route.request().method() === 'OPTIONS') return route.fulfill({ headers, status: 204 });
      event.team_palette = route.request().postDataJSON().p_palette;
      return route.fulfill({ headers, json: event.team_palette });
    });
    await page.route('**/rest/v1/rpc/upsert_team', (route) => {
      if (route.request().method() === 'OPTIONS') return route.fulfill({ headers, status: 204 });
      savedHex = route.request().postDataJSON().p_team.color_hex;
      return route.fulfill({ headers, json: {} });
    });
    await page.goto(`/manage/${eventId}/setup`);
    const editor = page.getByTestId('palette-editor');
    await editor.getByRole('button', { name: labels.palette.add, exact: true }).click();
    await editor.getByLabel(labels.palette.name).fill('Rose');
    await editor.getByLabel(labels.setup.hexColor).fill('#abcDEF');
    await editor.getByRole('button', { name: labels.common.save, exact: true }).click();
    await expect.poll(() => event.team_palette).toEqual([{ name: 'Rose', hex: '#ABCDEF' }]);
    await expect(editor.getByLabel(labels.setup.hexColor)).toHaveValue('#ABCDEF');
    await page.getByTestId('setup-step-teams').click();
    await page.getByRole('button', { name: 'Rose (#ABCDEF)', exact: true }).click();
    await expect(page.getByTestId('team-hex')).toHaveValue('#ABCDEF');
    await page.locator('[formControlName=code]').fill('T01');
    await page.locator('[formControlName=name_en]').fill('Rose team');
    await page.getByRole('button', { name: labels.common.save, exact: true }).click();
    await expect.poll(() => savedHex).toBe('#ABCDEF');
    await page.getByTestId('setup-step-settings').click();
    await editor.getByRole('button', { name: labels.palette.add, exact: true }).click();
    await editor.getByLabel(labels.palette.name).nth(1).fill('Duplicate');
    await editor.getByLabel(labels.setup.hexColor).nth(1).fill('#abcdef');
    await editor.getByRole('button', { name: labels.common.save, exact: true }).click();
    await expect(editor.getByText(labels.palette.invalid)).toBeVisible();
  });
}
