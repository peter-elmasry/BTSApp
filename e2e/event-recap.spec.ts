import { expect, test } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { mockOwner } from './owner-fixtures';
import { bootstrap, event, eventId } from './public-fixtures';
import type { EventRecap } from '../src/app/core/events/event-report-api';

test.use({ serviceWorkers: 'block' });
function report(): EventRecap {
  return {
    event: {
      ...event,
      name_en: 'Historical rehearsal',
      name_ar: 'تجربة سابقة',
      event_type: 'TEST',
      status: 'LIVE',
    },
    generated_at: '2026-10-18T12:00:00Z',
    blockers: { round_ids: [], match_ids: [] },
    teams: bootstrap.teams.map((t) => ({ id: t.id, code: t.code, name_en: t.name_en })),
    games: [
      { id: 'game-1', code: 'G01', name_en: 'First game', location_en: 'Field', is_neutral: false },
    ],
    rounds: [
      {
        id: 'round-1',
        number: 1,
        type: 'REGULAR',
        name_en: 'First round',
        status: 'CLOSED',
        duration_min: 10,
        extension_min: 2,
        started_at: '2026-10-18T10:00:00Z',
        closed_at: '2026-10-18T10:12:00Z',
      },
    ],
    matches: [
      {
        id: 'match-1',
        round_number: 1,
        round_type: 'REGULAR',
        game_code: 'G01',
        game_name_en: 'First game',
        game_name_ar: null,
        status: 'COMPLETED',
        participants: [{ team_code: 'T01', name_en: 'Team one', name_ar: null, outcome: 'WIN' }],
        entered_by: { name_en: 'Referee', name_ar: null },
        result_entered_at: '2026-10-18T10:11:00Z',
      },
    ],
    adjustments: [
      {
        id: 'adjustment-1',
        team_code: 'T01',
        team_name_en: 'Team one',
        team_name_ar: null,
        scope: 'EVENT',
        match_id: null,
        points: 0.25,
        reason: 'Quarter bonus',
        given_by: { name_en: 'Moderator', name_ar: null },
        created_at: '2026-10-18T10:15:00Z',
        revoked_at: null,
        revoke_reason: null,
        history: [
          {
            old_points: 0.5,
            new_points: 0.25,
            reason: 'Corrected amount',
            changed_by: { name_en: 'Moderator', name_ar: null },
            changed_at: '2026-10-18T10:16:00Z',
          },
        ],
      },
    ],
    staff: [
      {
        member_id: 'staff-1',
        username: 'ref',
        name_en: 'Referee',
        name_ar: null,
        role: 'REFEREE',
        game_codes: ['G01'],
        team_code: null,
      },
    ],
    standings: [
      {
        rank: 1,
        team: bootstrap.teams[0],
        played: 1,
        wins: 1,
        draws: 0,
        losses: 0,
        forfeits: 0,
        match_points: 2,
        adjustment_points: 0.25,
        total: 2.25,
        is_tied: false,
        final_tiebreak_pos: null,
      },
    ],
    players: [
      {
        id: 'player-1',
        name: 'Registered player',
        phone: '+201234567890',
        team_code: bootstrap.teams[0].code,
        status: 'ACTIVE',
        created_at: '2026-10-18T09:00:00Z',
        invite_id: 'safe-link-reference',
        invite_team_code: 'T01',
        invite_created_at: '2026-10-17T09:00:00Z',
        invite_created_by: 'Guide',
        possible_duplicate: true,
      },
    ],
  };
}
async function mockReport(page: import('@playwright/test').Page, lang: 'en' | 'ar' = 'en') {
  await mockOwner(page, lang);
  const snapshot = report();
  const finishOps: string[] = [];
  let loseResponse = false;
  let failCompletion = false;
  await page.route('**/rest/v1/rpc/**', async (route) => {
    const name = new URL(route.request().url()).pathname.split('/').at(-1);
    if (
      !['get_event_recap', 'get_event_header', 'finish_event', 'get_my_event_history'].includes(
        name!,
      )
    )
      return route.fallback();
    const headers = {
      'access-control-allow-origin': '*',
      'access-control-allow-headers': '*',
      'access-control-allow-methods': '*',
    };
    if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers });
    if (name === 'get_event_header') return route.fulfill({ headers, json: snapshot.event });
    if (name === 'get_event_recap') return route.fulfill({ headers, json: snapshot });
    if (name === 'get_my_event_history')
      return route.fulfill({
        headers,
        json: {
          history: [
            {
              ...snapshot.event,
              event_type: 'PROD',
              status: 'FINISHED',
              roles: [{ role: 'REFEREE', team_code: null, team_name: null, game_codes: ['G01'] }],
              can_recap: true,
            },
          ],
          managed: [],
        },
      });
    finishOps.push(route.request().postDataJSON().p_op_id);
    if (failCompletion) {
      snapshot.blockers.round_ids = ['round-1'];
      snapshot.rounds[0].status = 'ACTIVE';
      return route.fulfill({
        status: 400,
        headers,
        json: { message: 'EVENT_INCOMPLETE', code: 'P0001' },
      });
    }
    snapshot.event.status = 'FINISHED';
    snapshot.event.finished_at = '2026-10-18T12:00:00Z';
    if (loseResponse) {
      loseResponse = false;
      return route.abort('failed');
    }
    return route.fulfill({ headers, json: snapshot.event });
  });
  return {
    snapshot,
    finishOps,
    lose: () => {
      loseResponse = true;
    },
    block: () => {
      failCompletion = true;
    },
  };
}

for (const lang of ['en', 'ar'] as const) {
  test(`${lang} recap, header, private roster and phone-free complete print`, async ({ page }) => {
    await mockReport(page, lang);
    await page.goto(`/manage/${eventId}/recap`);
    await expect(
      page.getByTestId('event-recap').getByText('Registered player', { exact: true }),
    ).toBeVisible();
    await expect(page.getByTestId('test-event-banner')).toBeVisible();
    await expect(page.locator('.app-header')).toContainText(
      lang === 'en' ? 'Historical rehearsal' : 'تجربة سابقة',
    );
    await expect(page.getByText('Corrected amount', { exact: false })).toBeVisible();
    await expect(page.locator('.report-phone').last()).toBeVisible();
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    await page.emulateMedia({ media: 'print' });
    await expect(page.locator('.report-phone').last()).toBeHidden();
    await expect(page.locator('.app-header')).toBeHidden();
    await expect(page.locator('app-manage-nav')).toBeHidden();
    await expect(page.getByText('Registered player', { exact: true })).toBeVisible();
    await page.pdf({
      path: `artifacts/recap-${lang}.pdf`,
      preferCSSPageSize: true,
      printBackground: true,
    });
    await page.emulateMedia({ media: 'screen' });
    await page.screenshot({ path: `artifacts/recap-${lang}.png`, fullPage: true });
  });
}
test('end confirmation requires explicit action and refreshes final status', async ({ page }) => {
  const fixture = await mockReport(page);
  await page.goto(`/manage/${eventId}/recap`);
  await page.getByRole('button', { name: 'End event', exact: true }).click();
  expect(fixture.finishOps).toHaveLength(0);
  await page.getByRole('dialog').getByRole('button', { name: 'End event', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByTestId('event-recap')).toContainText('Finished');
  expect(fixture.finishOps).toHaveLength(1);
  await expect(page.getByRole('button', { name: 'End event', exact: true })).toHaveCount(0);
});
test('lost finish response retains operation ID on retry', async ({ page }) => {
  const fixture = await mockReport(page);
  fixture.lose();
  await page.goto(`/manage/${eventId}/recap`);
  await page.getByRole('button', { name: 'End event', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'End event', exact: true }).click();
  await page
    .getByRole('dialog')
    .getByRole('button', { name: 'Retry ending event', exact: true })
    .click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  expect(fixture.finishOps).toHaveLength(2);
  expect(fixture.finishOps[0]).toBe(fixture.finishOps[1]);
});
test('server rejects stale completion preview and page identifies blocking round', async ({
  page,
}) => {
  const fixture = await mockReport(page);
  fixture.block();
  await page.goto(`/manage/${eventId}/recap`);
  await page.getByRole('button', { name: 'End event', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'End event', exact: true }).click();
  await expect(page.getByTestId('completion-blockers')).toContainText('First round');
  await expect(page.getByRole('button', { name: 'End event', exact: true })).toHaveCount(0);
});
test('member history works independently of current event and links authorized recap', async ({
  page,
}) => {
  await mockReport(page);
  await page.goto('/account/history');
  await expect(page.getByTestId('history-event')).toContainText('Historical rehearsal');
  await expect(page.getByTestId('history-event')).toContainText('Referee');
  await page.getByTestId('history-event').getByRole('link', { name: 'Event recap' }).click();
  await expect(page.getByText('Registered player', { exact: true })).toBeVisible();
});
test('PROD header does not display TEST banner', async ({ page }) => {
  const fixture = await mockReport(page);
  fixture.snapshot.event.event_type = 'PROD';
  await page.goto(`/manage/${eventId}/recap`);
  await expect(page.getByText('Registered player', { exact: true })).toBeVisible();
  await expect(page.getByTestId('test-event-banner')).toHaveCount(0);
});

test('historical recap navigation stays scoped to that event', async ({ page }) => {
  const fixture = await mockReport(page);
  const pastId = '44000000-0000-0000-0000-000000000099';
  fixture.snapshot.event.id = pastId;
  await page.goto(`/manage/${pastId}/recap`);
  await expect(page.getByText('Registered player', { exact: true })).toBeVisible();
  await expect(page.locator('.safe-bottom').getByRole('link', { name: 'Control' })).toHaveAttribute(
    'href',
    `/manage/${pastId}/live`,
  );
  await page.getByTestId('account-menu').click();
  await expect(
    page.getByTestId('staff-menu').getByRole('link', { name: 'Event recap' }),
  ).toHaveAttribute('href', `/manage/${pastId}/recap`);
});

test('large report renders every registration in print without screen pagination', async ({
  page,
}) => {
  const fixture = await mockReport(page);
  const player = fixture.snapshot.players[0];
  fixture.snapshot.players = Array.from({ length: 120 }, (_, index) => ({
    ...player,
    id: `player-${index}`,
    name: `Roster person ${String(index).padStart(3, '0')}`,
  }));
  await page.goto(`/manage/${eventId}/recap`);
  await expect(page.getByText('Roster person 119', { exact: true })).toBeVisible();
  await page.emulateMedia({ media: 'print' });
  await expect(page.getByText('Roster person 000', { exact: true })).toBeVisible();
  await expect(page.getByText('Roster person 119', { exact: true })).toBeVisible();
  await expect(page.locator('.report-phone:visible')).toHaveCount(0);
  await page.pdf({ path: 'artifacts/recap-large.pdf', preferCSSPageSize: true });
});
