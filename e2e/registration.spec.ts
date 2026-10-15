import { expect, test, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { readFileSync } from 'node:fs';
import { bootstrap, eventId, mockPublicEvent } from './public-fixtures';
import { mockOwner } from './owner-fixtures';
import type {
  PlayerRegistration,
  RegistrationReceipt,
  TeamRoster,
} from '../src/app/core/player/registration-api';

test.use({ serviceWorkers: 'block' });
const token = 'a'.repeat(64);
const headers = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': '*',
  'access-control-allow-methods': '*',
};
const labels = (lang: string) =>
  JSON.parse(readFileSync(`public/i18n/${lang}.json`, 'utf8')).registration;

async function mockJoins(page: Page, lang = 'en') {
  await page.addInitScript((lang) => localStorage.setItem('bts.lang', lang), lang);
  await mockPublicEvent(page, { beforeStart: true });
  const state = {
    receipt: null as RegistrationReceipt | null,
    secret: '',
    calls: [] as Record<string, any>[],
    error: '',
    unavailable: false,
  };
  await page.route('**/rest/v1/rpc/**', async (route) => {
    const rpc = route.request().url().split('/').at(-1)!;
    if (!['get_team_invite', 'get_player_registration', 'join_team_invite'].includes(rpc))
      return route.fallback();
    if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers });
    const args = route.request().postDataJSON();
    const fail = (message: string) =>
      route.fulfill({ status: 400, headers, json: { code: 'P0001', message } });
    let data: unknown;
    if (rpc === 'get_team_invite') {
      if (state.unavailable) return fail('INVITE_UNAVAILABLE');
      data = {
        event_id: eventId,
        event_name: 'Registration Event',
        event_name_ar: 'حدث التسجيل',
        team: bootstrap.teams[args.p_token === token ? 0 : 1],
        guides: [{ name_en: 'Mina', name_ar: 'مينا' }],
      };
    } else if (rpc === 'get_player_registration')
      data = args.p_secret === state.secret ? state.receipt : null;
    else {
      state.calls.push(args);
      if (state.error) return fail(state.error);
      state.secret = args.p_secret;
      state.receipt ??= {
        id: 'player-one',
        event_id: eventId,
        team_id: 'team-1',
        team_code: 'T01',
        status: 'ACTIVE',
        version: 1,
      };
      data = state.receipt;
    }
    return route.fulfill({ headers, json: data });
  });
  return state;
}

for (const lang of ['en', 'ar']) {
  test(`name-only invite registration remembers one team and refuses another link in ${lang}`, async ({
    page,
  }) => {
    const l = labels(lang);
    const state = await mockJoins(page, lang);
    await page.goto(`/join/${eventId}#${token}`);
    await expect(page.getByTestId('join-form')).toBeVisible();
    await expect(page.getByTestId('join-submit')).toBeDisabled();
    await page.getByLabel(l.name, { exact: true }).fill('Guest Player');
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
    await page.getByTestId('join-submit').dblclick();
    await expect(page).toHaveURL(/\/home$/);
    expect(state.calls).toHaveLength(1);
    expect(state.calls[0].p_phone).toBeNull();
    expect(state.calls[0].p_secret).toMatch(/^[a-f0-9]{64}$/);
    await page.reload();
    await expect(
      page.getByRole('heading', {
        level: 2,
        name: lang === 'ar' ? 'الصقور' : 'Falcons',
        exact: true,
      }),
    ).toBeVisible();
    await page.goto(`/join/${eventId}#${'b'.repeat(64)}`);
    await expect(page.getByTestId('existing-registration')).toBeVisible();
    await expect(page.getByTestId('join-form')).toHaveCount(0);
    await page.getByRole('link', { name: l.returnTeam }).click();
    await page.goto('/choose-team');
    await expect(page.getByTestId('team-card-T02')).toBeDisabled();
    await expect(page.getByTestId('team-locked')).toHaveText(l.locked);
    expect(state.calls).toHaveLength(1);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    await page.screenshot({ path: `artifacts/registration-locked-${lang}.png`, fullPage: true });
  });

  test(`private roster corrections and batch undo are reversible in ${lang}`, async ({ page }) => {
    test.setTimeout(60000);
    const l = labels(lang);
    await mockOwner(page, lang as 'en' | 'ar');
    const players: PlayerRegistration[] = [
      {
        id: 'player-one',
        name: 'Guest Player',
        phone: '+201012345678',
        team_id: 'team-1',
        invite_id: 'invite-one',
        status: 'ACTIVE',
        version: 1,
        removed_batch: null,
        created_at: new Date().toISOString(),
        possible_duplicate: true,
      },
    ];
    const roster: TeamRoster = {
      admin: true,
      registration_open: true,
      players,
      invites: [
        {
          id: 'invite-one',
          token,
          enabled: true,
          expires_at: '2026-12-15T00:00:00Z',
          created_at: '2026-10-15T00:00:00Z',
        },
      ],
    };
    const calls: string[] = [];
    await page.route('**/rest/v1/rpc/**', async (route) => {
      const rpc = route.request().url().split('/').at(-1)!;
      if (
        ![
          'get_team_players',
          'correct_player_registration',
          'preview_invite_rollback',
          'rollback_invite_registrations',
          'restore_registration_batch',
          'manage_team_invite',
          'set_player_registration_open',
        ].includes(rpc)
      )
        return route.fallback();
      if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers });
      const args = route.request().postDataJSON();
      let data: unknown = {};
      if (rpc === 'get_team_players')
        data = { ...roster, players: players.filter((player) => player.team_id === args.p_team) };
      else if (rpc === 'correct_player_registration') {
        calls.push(args.p_action);
        if (args.p_action === 'EDIT') {
          players[0].name = args.p_name;
          players[0].phone = args.p_phone;
        }
        if (args.p_action === 'REMOVE') players[0].status = 'REMOVED';
        if (args.p_action === 'RESTORE') players[0].status = 'ACTIVE';
        if (args.p_action === 'TRANSFER') players[0].team_id = args.p_team;
        players[0].version++;
      } else if (rpc === 'preview_invite_rollback')
        data = players
          .filter((p) => p.status === 'ACTIVE')
          .map(({ id, version, name }) => ({ id, version, name }));
      else if (rpc === 'rollback_invite_registrations') {
        expect(args.p_expected).toEqual([
          { id: players[0].id, version: players[0].version, name: players[0].name },
        ]);
        players[0].status = 'REMOVED';
        players[0].removed_batch = 'batch-one';
        calls.push('ROLLBACK');
      } else if (rpc === 'restore_registration_batch') {
        players[0].status = 'ACTIVE';
        players[0].removed_batch = null;
        calls.push('RESTORE_BATCH');
      } else if (rpc === 'set_player_registration_open') {
        roster.registration_open = args.p_open;
        calls.push('PAUSE');
      } else {
        roster.invites[0].enabled = false;
        calls.push(args.p_action);
      }
      return route.fulfill({ headers, json: data });
    });
    await page.goto(`/players/${eventId}`);
    await expect(page.getByTestId('player-player-one')).toBeVisible();
    await expect(page.getByTestId('invite-url')).toHaveValue(
      `${new URL(page.url()).origin}/join/${eventId}#${token}`,
    );
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
    const confirm = async (reason = true) => {
      if (reason) await page.getByLabel(l.reason).fill('Correct a mistake');
      await page.getByTestId('confirm-registration-action').click();
      await expect(page.locator('dialog')).toHaveCount(0);
    };
    await page
      .getByTestId('player-player-one')
      .getByRole('button', { name: l.action.EDIT, exact: true })
      .click();
    await page.getByLabel(l.name).fill('Corrected Name');
    await page.getByLabel(l.phone).fill('');
    await confirm();
    await expect(page.getByTestId('player-player-one')).toContainText('Corrected Name');
    await page.getByRole('button', { name: l.action.REMOVE, exact: true }).click();
    await confirm();
    await expect(page.getByTestId('player-player-one')).toContainText(l.status.REMOVED);
    await page.getByRole('button', { name: l.action.RESTORE, exact: true }).click();
    await confirm();
    await expect(page.getByTestId('player-player-one')).toContainText(l.status.ACTIVE);
    await page.getByRole('button', { name: l.preview, exact: true }).click();
    await expect(page.locator('dialog')).toContainText('Corrected Name');
    await confirm();
    await expect(page.getByTestId('player-player-one')).toContainText(l.status.REMOVED);
    await page.getByRole('button', { name: new RegExp(l.action.RESTORE_BATCH) }).click();
    await confirm();
    await expect(page.getByTestId('player-player-one')).toContainText(l.status.ACTIVE);
    await page.getByRole('button', { name: l.action.TRANSFER, exact: true }).click();
    await page
      .locator('dialog')
      .getByRole('combobox', { name: l.team, exact: true })
      .selectOption('team-2');
    await confirm();
    await expect(page.getByTestId('player-player-one')).toHaveCount(0);
    await page.getByTestId('roster-team').selectOption('team-2');
    await expect(page.getByTestId('player-player-one')).toBeVisible();
    await page.getByRole('button', { name: l.action.PAUSE, exact: true }).click();
    await confirm(false);
    await expect(page.getByText(l.paused, { exact: true })).toBeVisible();
    expect(calls).toEqual([
      'EDIT',
      'REMOVE',
      'RESTORE',
      'ROLLBACK',
      'RESTORE_BATCH',
      'TRANSFER',
      'PAUSE',
    ]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    await page.screenshot({ path: `artifacts/registration-roster-${lang}.png`, fullPage: true });
  });
}

test('invalid and revoked invite links never show a join form', async ({ page }) => {
  const state = await mockJoins(page);
  state.unavailable = true;
  await page.goto(`/join/${eventId}#${token}`);
  await expect(page.getByRole('alert')).toHaveText(labels('en').error.INVITE_UNAVAILABLE);
  await expect(page.getByTestId('join-form')).toHaveCount(0);
  expect(state.calls).toHaveLength(0);
});

test('failed joins can be retried with the same receipt and operation ID', async ({ page }) => {
  const state = await mockJoins(page);
  state.error = 'INVALID_PHONE';
  await page.goto(`/join/${eventId}#${token}`);
  await page.getByLabel(labels('en').name, { exact: true }).fill('Guest');
  await page.getByLabel(labels('en').phone, { exact: true }).fill('bad');
  await page.getByTestId('join-submit').click();
  await expect(page.getByRole('alert')).toHaveText(labels('en').error.INVALID_PHONE);
  state.error = '';
  await page.getByLabel(labels('en').phone, { exact: true }).fill('01012345678');
  await page.getByTestId('join-submit').click();
  await expect(page).toHaveURL(/\/home$/);
  expect(state.calls[0].p_secret).toBe(state.calls[1].p_secret);
  expect(state.calls[0].p_op_id).toBe(state.calls[1].p_op_id);
});

test('guest device follows an admin transfer and removal after reloading', async ({ page }) => {
  const state = await mockJoins(page);
  await page.goto(`/join/${eventId}#${token}`);
  await page.getByLabel(labels('en').name, { exact: true }).fill('Guest');
  await page.getByTestId('join-submit').click();
  await expect(page).toHaveURL(/\/home$/);
  state.receipt = { ...state.receipt!, team_id: 'team-2', team_code: 'T02', version: 2 };
  await page.reload();
  await expect(page.getByRole('heading', { level: 2, name: 'Stars', exact: true })).toBeVisible();
  state.receipt = { ...state.receipt, status: 'REMOVED', version: 3 };
  await page.goto(`/join/${eventId}#${token}`);
  await expect(page.getByTestId('existing-registration')).toHaveText(labels('en').removed);
  await expect(page.getByTestId('join-form')).toHaveCount(0);
});

test('guide roster shows only assigned teams and hides admin controls', async ({ page }) => {
  await mockOwner(page, 'en');
  const profile = {
    id: 'guide-one',
    username: 'guide',
    phone: null,
    full_name_en: 'Guide',
    full_name_ar: null,
    system_role: 'MEMBER',
    roles: [{ event_id: eventId, role: 'GUIDE', team_id: 'team-1' }],
    assigned_games: [],
  };
  await page.route('**/rest/v1/rpc/get_my_profile', (route) =>
    route.fulfill({ headers, json: profile }),
  );
  await page.route('**/rest/v1/rpc/get_team_players', (route) =>
    route.fulfill({
      headers,
      json: { admin: false, registration_open: true, players: [], invites: [] },
    }),
  );
  await page.goto(`/players/${eventId}`);
  await expect(page.getByTestId('roster-team').locator('option')).toHaveCount(1);
  await expect(page.getByRole('button', { name: labels('en').action.CREATE })).toBeVisible();
  await expect(page.getByRole('button', { name: labels('en').action.PAUSE })).toHaveCount(0);
  await page.goto(`/join/${eventId}#${token}`);
  await expect(page.getByText(labels('en').staffHint)).toBeVisible();
  await expect(page.getByTestId('join-form')).toHaveCount(0);
});

test('guide can create, replace and disable their invite without removing players', async ({
  page,
}) => {
  await mockOwner(page, 'en');
  const l = labels('en');
  const roster: TeamRoster = { admin: false, registration_open: true, players: [], invites: [] };
  const actions: string[] = [];
  await page.route('**/rest/v1/rpc/get_team_players', (route) =>
    route.fulfill({ headers, json: roster }),
  );
  await page.route('**/rest/v1/rpc/manage_team_invite', (route) => {
    if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers });
    const args = route.request().postDataJSON();
    actions.push(args.p_action);
    roster.invites.forEach((invite) => (invite.enabled = false));
    if (args.p_action !== 'DISABLE')
      roster.invites.unshift({
        id: `invite-${actions.length}`,
        token: (actions.length === 1 ? 'a' : 'b').repeat(64),
        enabled: true,
        expires_at: '2026-12-15T00:00:00Z',
        created_at: '2026-10-15T00:00:00Z',
      });
    return route.fulfill({ headers, json: {} });
  });
  await page.goto(`/players/${eventId}`);
  for (const action of ['CREATE', 'REPLACE', 'DISABLE']) {
    await page.getByRole('button', { name: l.action[action], exact: true }).click();
    await page.getByTestId('confirm-registration-action').click();
    await expect(page.locator('dialog')).toHaveCount(0);
    if (action === 'CREATE')
      await expect(page.getByTestId('invite-url')).toHaveValue(new RegExp(`#${token}$`));
    if (action === 'REPLACE')
      await expect(page.getByTestId('invite-url')).toHaveValue(new RegExp(`#${'b'.repeat(64)}$`));
  }
  await expect(page.getByRole('button', { name: l.action.CREATE, exact: true })).toBeVisible();
  expect(actions).toEqual(['CREATE', 'REPLACE', 'DISABLE']);
  expect(roster.players).toEqual([]);
});

test('an offline join never reports success and can resume online', async ({ page, context }) => {
  const state = await mockJoins(page);
  await page.goto(`/join/${eventId}#${token}`);
  await page.getByLabel(labels('en').name, { exact: true }).fill('Guest');
  await context.setOffline(true);
  await page.route('**/rest/v1/rpc/join_team_invite', (route) =>
    route.abort('internetdisconnected'),
  );
  await page.getByTestId('join-submit').click();
  await expect(page.getByRole('alert')).toHaveText(labels('en').error.OFFLINE);
  await expect(page).toHaveURL(/\/join\//);
  expect(state.receipt).toBeNull();
  await context.setOffline(false);
  await page.unroute('**/rest/v1/rpc/join_team_invite');
  await page.getByTestId('join-submit').click();
  await expect(page).toHaveURL(/\/home$/);
});
