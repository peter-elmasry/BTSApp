import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { mockOwner } from './owner-fixtures';
import { bootstrap, event, eventId, matches } from './public-fixtures';

test.use({ serviceWorkers: 'block' });
const labels = (lang: string) => JSON.parse(readFileSync(`public/i18n/${lang}.json`, 'utf8'));
const headers = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': '*',
  'access-control-allow-methods': '*',
};
const livesEvent = { ...event, scoring_mode: 'LIVES', initial_lives: 3, life_emoji: '💛' };

async function mockSetupRpc(page: Page, started: boolean) {
  const saved: Record<string, unknown>[] = [];
  await page.route('**/rest/v1/rpc/**', (route) => {
    const name = new URL(route.request().url()).pathname.split('/').at(-1);
    if (!['get_event_setup', 'upsert_event_settings'].includes(name!)) return route.fallback();
    if (route.request().method() === 'OPTIONS') return route.fulfill({ headers, status: 204 });
    if (name === 'upsert_event_settings') {
      saved.push(route.request().postDataJSON().p_settings);
      return route.fulfill({ headers, json: { event_id: eventId, settings: {} } });
    }
    return route.fulfill({
      headers,
      json: {
        event: { ...event, match_bonus_cap: null, scoring_mode: 'POINTS', life_emoji: '❤️' },
        teams: bootstrap.teams,
        games: bootstrap.games,
        rounds: [{ ...bootstrap.rounds[1], started_at: started ? new Date().toISOString() : null }],
        matches: [],
        roles: [],
        referee_games: [],
        eligible_members: [],
      },
    });
  });
  return saved;
}

for (const lang of ['en', 'ar'] as const) {
  test(`admin switches an event to lives scoring before play in ${lang}`, async ({ page }) => {
    const t = labels(lang);
    await mockOwner(page, lang);
    const saved = await mockSetupRpc(page, false);
    await page.goto(`/manage/${eventId}/setup`);
    const scoring = page.getByTestId('scoring-settings');
    await scoring.getByRole('radio', { name: t.scoring.lives }).check();
    await expect(page.getByLabel(t.manage.pointsWin)).toBeHidden();
    await scoring.getByTestId('initial-lives').fill('3');
    await expect(scoring.getByTestId('gain-draw')).toHaveValue('-0.5');
    await expect(scoring.getByTestId('gain-draw')).toHaveAttribute('readonly', '');
    await expect(scoring.locator('svg[data-heart="full"]')).toHaveCount(3);
    await scoring.getByTestId('initial-lives').fill('13');
    await expect(scoring.locator('svg[data-heart="full"]')).toHaveCount(13);
    await scoring.getByTestId('initial-lives').fill('9999');
    await expect.poll(() => scoring.locator('svg[data-heart="full"]').count()).toBeLessThan(30);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    await scoring.getByTestId('initial-lives').fill('3');
    await page.screenshot({ path: 'artifacts/half-hearts-' + lang + '.png', fullPage: true });
    await expect(scoring.getByTestId('lives-meter')).toHaveAttribute(
      'aria-label',
      t.scoring.livesLeft.replace('{{n}}', '3'),
    );
    await page.getByRole('button', { name: t.common.save, exact: true }).first().click();
    await expect.poll(() => saved.length).toBe(1);
    expect(saved[0]).toMatchObject({
      scoring_mode: 'LIVES',
      initial_lives: 3,
      life_emoji: '❤️',
      points_draw: -0.5,
    });
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  });

  test(`scoring mode is locked once a round has started in ${lang}`, async ({ page }) => {
    const t = labels(lang);
    await mockOwner(page, lang);
    await mockSetupRpc(page, true);
    await page.goto(`/manage/${eventId}/setup`);
    const scoring = page.getByTestId('scoring-settings');
    await expect(scoring.getByRole('status')).toHaveText(t.scoring.locked);
    await expect(scoring.getByRole('radio', { name: t.scoring.lives })).toBeDisabled();
  });

  test(`players see their lives and a once-only life-lost animation in ${lang}`, async ({
    page,
  }) => {
    const t = labels(lang);
    let lost = false;
    await page.addInitScript(
      (value) => {
        localStorage.setItem('bts.lang', value.lang);
        localStorage.setItem(`bts.team.${value.eventId}`, 'T01');
      },
      { lang, eventId },
    );
    await page.route('http://127.0.0.1:54321/**', async (route) => {
      if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers });
      const rpc = new URL(route.request().url()).pathname.split('/').at(-1);
      const current = matches.map((m) =>
        lost && m.id === 'match-1'
          ? {
              ...m,
              status: 'COMPLETED' as const,
              participants: m.participants.map((p) => ({
                ...p,
                outcome: p.team_code === 'T01' ? ('LOSS' as const) : undefined,
              })),
            }
          : m,
      );
      let data: unknown = null;
      if (rpc === 'get_current_event') data = livesEvent;
      if (rpc === 'get_bootstrap') data = bootstrap;
      if (rpc === 'get_schedule')
        data = current.map((m) => ({
          ...m,
          participants: m.participants.map(({ outcome: _o, ...p }) => p),
        }));
      if (rpc === 'server_now') data = new Date().toISOString();
      if (rpc === 'get_team_view')
        data = {
          team: bootstrap.teams[0],
          matches: current,
          adjustments: [],
          // Lives come from the server breakdown (R6), not from client-side scoring.
          breakdown: {
            scoring_mode: 'LIVES',
            initial_lives: 3,
            match_points: lost ? 2 : 3,
            adjustment_points: 0,
            total: lost ? 2 : 3,
            lives_change: lost ? -1 : 0,
          },
        };
      return route.fulfill({ status: 200, headers, json: data });
    });
    await page.goto('/home');
    await expect(page.getByTestId('home-lives')).toContainText(
      t.scoring.livesLeft.replace('{{n}}', '3'),
    );
    await expect(page.getByTestId('life-lost')).toHaveCount(0);
    lost = true;
    await page.getByRole('button', { name: t.player.refresh }).click();
    const overlay = page.getByTestId('life-lost');
    await expect(overlay).toBeVisible();
    await expect(overlay).toContainText(t.scoring.lifeLostTitle);
    await expect(overlay).toContainText(
      t.scoring.lifeLostLeft.replace('{{n}}', '2').replace('{{emoji}}', '💛'),
    );
    // The crack animation is aria-hidden decoration; audit everything else while it runs.
    expect((await new AxeBuilder({ page }).exclude('.heart-stage').analyze()).violations).toEqual(
      [],
    );
    await overlay.getByRole('button', { name: t.scoring.lifeLostOk }).click();
    await expect(overlay).toHaveCount(0);
    await expect(page.getByTestId('home-lives')).toContainText(
      t.scoring.livesLeft.replace('{{n}}', '2'),
    );
    await page.reload();
    await expect(page.getByTestId('home-lives')).toBeVisible();
    await page.waitForTimeout(500);
    await expect(page.getByTestId('life-lost')).toHaveCount(0);
  });
  test(`players see exact half hearts and a once-only draw animation in ${lang}`, async ({
    page,
  }) => {
    const t = labels(lang);
    let lost = false;
    await page.addInitScript(
      (value) => {
        localStorage.setItem('bts.lang', value.lang);
        localStorage.setItem(`bts.team.${value.eventId}`, 'T01');
      },
      { lang, eventId },
    );
    await page.route('http://127.0.0.1:54321/**', async (route) => {
      if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers });
      const rpc = new URL(route.request().url()).pathname.split('/').at(-1);
      const current = matches.map((m) =>
        lost && m.id === 'match-1'
          ? {
              ...m,
              status: 'COMPLETED' as const,
              lives_delta: -0.5,
              participants: m.participants.map((p) => ({
                ...p,
                outcome: p.team_code === 'T01' ? ('DRAW' as const) : undefined,
              })),
            }
          : m,
      );
      let data: unknown = null;
      if (rpc === 'get_current_event') data = livesEvent;
      if (rpc === 'get_bootstrap') data = bootstrap;
      if (rpc === 'get_schedule')
        data = current.map((m) => ({
          ...m,
          participants: m.participants.map(({ outcome: _o, ...p }) => p),
        }));
      if (rpc === 'server_now') data = new Date().toISOString();
      if (rpc === 'get_team_view')
        data = {
          team: bootstrap.teams[0],
          matches: current,
          adjustments: [],
          // Lives come from the server breakdown (R6), not from client-side scoring.
          breakdown: {
            scoring_mode: 'LIVES',
            initial_lives: 3,
            match_points: lost ? 2.5 : 3,
            adjustment_points: 0,
            total: lost ? 2.5 : 3,
            lives_change: lost ? -0.5 : 0,
          },
        };
      return route.fulfill({ status: 200, headers, json: data });
    });
    await page.goto('/home');
    await expect(page.getByTestId('home-lives')).toContainText(
      t.scoring.livesLeft.replace('{{n}}', '3'),
    );
    await expect(page.getByTestId('life-lost')).toHaveCount(0);
    lost = true;
    await page.getByRole('button', { name: t.player.refresh }).click();
    const overlay = page.getByTestId('life-lost');
    await expect(overlay).toBeVisible();
    await expect(overlay).toContainText(t.scoring.halfHeartLost);
    await expect(overlay).toContainText(
      t.scoring.lifeLostLeft.replace('{{n}}', '2.5').replace('{{emoji}}', '💛'),
    );
    // The crack animation is aria-hidden decoration; audit everything else while it runs.
    expect((await new AxeBuilder({ page }).exclude('.heart-stage').analyze()).violations).toEqual(
      [],
    );
    await overlay.getByRole('button', { name: t.scoring.lifeLostOk }).click();
    await expect(overlay).toHaveCount(0);
    await expect(page.getByTestId('home-lives')).toContainText(
      t.scoring.livesLeft.replace('{{n}}', '2.5'),
    );
    await page.reload();
    await expect(page.getByTestId('home-lives')).toBeVisible();
    await page.waitForTimeout(500);
    await expect(page.getByTestId('life-lost')).toHaveCount(0);
  });
}
