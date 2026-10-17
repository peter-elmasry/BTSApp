import { expect, test } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { readFileSync } from 'node:fs';
import { mockLiveEvent } from './live-fixtures';
import { mockStandingsEvent } from './standings-fixtures';
import { eventId, bootstrap, event } from './public-fixtures';

test.use({ serviceWorkers: 'block' });
const labels = (lang: 'en' | 'ar') =>
  JSON.parse(readFileSync('public/i18n/' + lang + '.json', 'utf8'));
const bonus = (issuer: string) => ({
  id: 'original-bonus',
  scope: 'MATCH' as const,
  match_id: 'match-1',
  team_id: 'team-1',
  points: 1,
  reason: 'Original bonus',
  given_by: { id: issuer, name_en: 'Original issuer', name_ar: 'صاحب المكافأة' },
  created_at: '2026-10-17T10:00:00Z',
  revoked_at: null,
  revoke_reason: null,
});

for (const lang of ['en', 'ar'] as const) {
  test('issuer edits a closed-round bonus without losing history in ' + lang, async ({ page }) => {
    const fixture = await mockLiveEvent(page, { lang });
    fixture.snapshot.adjustments.push(bonus(fixture.profile.id));
    fixture.snapshot.rounds[0].status = 'CLOSED';
    const t = labels(lang);
    await page.goto('/ref/match/match-1');
    await page.getByTestId('toggle-adjustments').click();
    await page.getByTestId('edit-adjustment').click();
    const sheet = page.getByTestId('adjustment-edit-sheet');
    await expect(sheet).toContainText(t.adjustEdit.preserve);
    await sheet.getByRole('spinbutton', { name: t.adjustEdit.amount }).fill('0.25');
    await sheet
      .getByRole('textbox', { name: t.adjustEdit.reason })
      .fill('Correcting to quarter heart');
    expect((await new AxeBuilder({ page }).include('dialog').analyze()).violations).toEqual([]);
    await page.getByTestId('save-adjustment-edit').click();
    await expect.poll(() => fixture.snapshot.adjustments[0].points).toBe(0.25);
    expect(fixture.snapshot.adjustments).toHaveLength(1);
    expect(fixture.snapshot.adjustments[0]).toMatchObject({
      id: 'original-bonus',
      reason: 'Original bonus',
      created_at: '2026-10-17T10:00:00Z',
      given_by: { id: fixture.profile.id },
      revision: 1,
    });
    await page.getByTestId('adjustment-history').locator('summary').click();
    await expect(page.getByTestId('adjustment-history')).toContainText('1 → 0.25');
    await page.getByTestId('edit-adjustment').click();
    await sheet.getByRole('spinbutton', { name: t.adjustEdit.amount }).fill('0.5');
    await sheet
      .getByRole('textbox', { name: t.adjustEdit.reason })
      .fill('Correcting to half heart');
    await page.getByTestId('save-adjustment-edit').click();
    await expect.poll(() => fixture.snapshot.adjustments[0].revision).toBe(2);
    await expect(page.getByTestId('adjustment-history')).toContainText('0.25 → 0.5');
    await page.getByRole('button', { name: t.live.revoke, exact: true }).click();
    await page.locator('dialog').getByRole('textbox').fill('Cancel corrected bonus');
    await page.locator('dialog').getByRole('button', { name: t.live.revoke, exact: true }).click();
    await expect.poll(() => fixture.snapshot.adjustments[0].revoked_at).not.toBeNull();
    expect(fixture.snapshot.adjustments[0].history).toHaveLength(2);
    await expect(page.getByTestId('edit-adjustment')).toHaveCount(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
  });
}

test('other issuer has no edit or revoke button; same-event moderator can edit the table row', async ({
  page,
}) => {
  const fixture = await mockStandingsEvent(page, { role: 'EVENT_ADMIN' });
  fixture.snapshot.adjustments.push(bonus('someone-else'));
  await page.goto('/manage/' + eventId + '/adjustments');
  await page.getByTestId('edit-adjustment').click();
  await expect(page.getByTestId('adjustment-edit-sheet')).toBeVisible();
});

test('another referee cannot edit or revoke the bonus', async ({ page }) => {
  const fixture = await mockLiveEvent(page);
  fixture.snapshot.adjustments.push(bonus('someone-else'));
  await page.goto('/ref/match/match-1');
  await page.getByTestId('toggle-adjustments').click();
  await expect(page.getByText('Original bonus', { exact: true })).toBeVisible();
  await expect(page.getByTestId('edit-adjustment')).toHaveCount(0);
  await expect(
    page.getByRole('button', { name: labels('en').live.revoke, exact: true }),
  ).toHaveCount(0);
});

test('a stale edit is refused without overwriting history', async ({ page }) => {
  const fixture = await mockLiveEvent(page);
  fixture.snapshot.adjustments.push(bonus(fixture.profile.id));
  await page.route('**/rest/v1/rpc/edit_adjustment', (route) =>
    route.fulfill({ status: 400, json: { code: 'P0001', message: 'ADJUSTMENT_CHANGED' } }),
  );
  const t = labels('en');
  await page.goto('/ref/match/match-1');
  await page.getByTestId('toggle-adjustments').click();
  await page.getByTestId('edit-adjustment').click();
  await page.getByTestId('adjustment-edit-sheet').getByRole('spinbutton').fill('0.25');
  await page.getByTestId('adjustment-edit-sheet').getByRole('textbox').fill('Stale correction');
  await page.getByTestId('save-adjustment-edit').click();
  await expect(page.locator('dialog').getByRole('alert')).toHaveText(
    t['errors.ADJUSTMENT_CHANGED'],
  );
  expect(fixture.snapshot.adjustments[0].points).toBe(1);
});

test('quarter and three-quarter hearts render as SVGs, alongside half and full hearts', async ({
  page,
}) => {
  let total = 2.25;
  await page.addInitScript((id) => localStorage.setItem('bts.team.' + id, 'T01'), eventId);
  await page.route('http://127.0.0.1:54321/**', async (route) => {
    const rpc = new URL(route.request().url()).pathname.split('/').at(-1);
    const headers = {
      'access-control-allow-origin': '*',
      'access-control-allow-headers': '*',
      'access-control-allow-methods': '*',
    };
    if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers });
    let data: unknown = null;
    if (rpc === 'get_current_event') data = { ...event, scoring_mode: 'LIVES', initial_lives: 3 };
    if (rpc === 'get_bootstrap') data = bootstrap;
    if (rpc === 'get_schedule') data = [];
    if (rpc === 'server_now') data = new Date().toISOString();
    if (rpc === 'get_team_view')
      data = {
        team: bootstrap.teams[0],
        matches: [],
        adjustments: [],
        breakdown: {
          scoring_mode: 'LIVES',
          initial_lives: 3,
          match_points: total,
          adjustment_points: 0,
          total,
          lives_change: total - 3,
        },
      };
    await route.fulfill({ json: data, headers });
  });
  await page.goto('/home');
  await expect(page.locator('[data-heart="quarter"]').first()).toBeVisible();
  await expect(page.locator('[data-heart="full"]').first()).toBeVisible();
  await page.screenshot({ path: 'artifacts/quarter-hearts.png', fullPage: true });
  total = 2.75;
  await page.reload();
  await expect(page.locator('[data-heart="three-quarter"]').first()).toBeVisible();
  total = 2.5;
  await page.reload();
  await expect(page.locator('[data-heart="half"]').first()).toBeVisible();
});
