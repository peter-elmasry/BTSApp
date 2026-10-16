import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { mockStandingsEvent } from './standings-fixtures';
import { mockAudio } from './audio-fixtures';
import { eventId } from './public-fixtures';

test.use({ serviceWorkers: 'block' });
test('a subscribed screen recovers scores and visibility without any broadcasts', async ({
  page,
}) => {
  const audio = await mockAudio(page);
  const fixture = await mockStandingsEvent(page);
  await page.route('**/rest/v1/rpc/get_event_update_token', (route) => {
    const headers = {
      'access-control-allow-origin': '*',
      'access-control-allow-headers': '*',
      'access-control-allow-methods': '*',
    };
    if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers });
    return route.fulfill({ headers, json: JSON.stringify([fixture.rows, fixture.snapshot.event]) });
  });
  await page.goto('/leaderboard');
  const list = page.locator('app-leaderboard-page app-standings-list');
  await expect(list.locator('.total-number [aria-hidden="true"]')).toHaveText(['1', '1']);
  fixture.rows[0].total = 4;
  await audio.emit('match_changed', { type: 'match_changed', matchId: 'match-1' });
  await expect(list.locator('.total-number [aria-hidden="true"]').first()).toHaveText('4', {
    timeout: 2000,
  });
  fixture.rows[0].total = 9;
  await expect(list.locator('.total-number [aria-hidden="true"]').first()).toHaveText('9', {
    timeout: 7000,
  });
  fixture.snapshot.event.leaderboard_public = false;
  await expect(list).toHaveCount(0, { timeout: 7000 });
});

for (const lang of ['en', 'ar'] as const) {
  test(`admin sound disclosure and remote updates preserve settings drafts in ${lang}`, async ({
    page,
  }) => {
    const fixture = await mockStandingsEvent(page, { role: 'EVENT_ADMIN', lang });
    const labels = JSON.parse(readFileSync(`public/i18n/${lang}.json`, 'utf8'));
    await page.goto(`/manage/${eventId}/setup`);
    const sound = page.getByTestId('admin-audio-options');
    await expect(sound).toBeVisible();
    await expect(sound).not.toHaveAttribute('open', '');
    await sound.locator('summary').click();
    const master = sound.getByRole('checkbox', { name: labels.audio.master, exact: true });
    await master.uncheck();
    await sound.locator('summary').click();
    await expect(page.getByText(labels.audio.unsaved, { exact: true })).toBeVisible();
    const name = page.getByLabel(labels.manage.eventName, { exact: true });
    await name.fill('My unsaved event name');
    fixture.snapshot.event.name_en = 'Remote event name';
    await expect(page.getByText(labels.live.changesAvailable, { exact: true })).toBeVisible({
      timeout: 7000,
    });
    await expect(name).toHaveValue('My unsaved event name');
    await sound.locator('summary').click();
    await expect(master).not.toBeChecked();
    expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(
      false,
    );
    await page.screenshot({ path: `artifacts/realtime-drafts-${lang}.png`, fullPage: true });
  });
}
