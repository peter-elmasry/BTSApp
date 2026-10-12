import { expect, test } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { readFileSync } from 'node:fs';
import { bootstrap, eventId, mockPublicEvent } from './public-fixtures';

// Mocked backend journeys; SQL privacy is independently covered by pgTAP.
test.use({ serviceWorkers: 'block' });
for (const lang of ['en', 'ar']) {
  test(`confirmed player choice, reload, schedule and switching in ${lang}`, async ({ page }) => {
    const labels = JSON.parse(readFileSync(`public/i18n/${lang}.json`, 'utf8'));
    const teamName = (index: number) =>
      lang === 'ar' ? bootstrap.teams[index].name_ar! : bootstrap.teams[index].name_en;
    await page.addInitScript((value) => localStorage.setItem('bts.lang', value), lang);
    await mockPublicEvent(page);
    await page.goto('/home');
    await expect(page).toHaveURL(/\/choose-team/);
    await expect(page.getByTestId('team-card-T01')).toBeVisible();
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
    await page.getByTestId('team-card-T01').click();
    expect(
      await page.evaluate((key) => localStorage.getItem(key), `bts.team.${eventId}`),
    ).toBeNull();
    await page.getByTestId('confirm-team').click();
    await expect(page).toHaveURL(/\/home$/);
    await expect(
      page.getByRole('heading', { level: 2, name: teamName(0), exact: true }),
    ).toBeVisible();
    await expect(page.getByTestId('current-match')).toBeVisible();
    await page.reload();
    await expect(
      page.getByRole('heading', { level: 2, name: teamName(0), exact: true }),
    ).toBeVisible();
    expect(await page.evaluate((key) => localStorage.getItem(key), `bts.team.${eventId}`)).toBe(
      'T01',
    );
    await page.goto('/schedule');
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await expect(page.getByText(lang === 'ar' ? 'التتابع' : 'Relay').first()).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
    await page.goto('/teams/T01');
    await expect(
      page.getByRole('heading', { level: 2, name: teamName(0), exact: true }),
    ).toBeVisible();
    await expect(page.locator('a[href^="tel:"]')).toHaveCount(0);
    await page.goto('/games/G01');
    await expect(
      page.getByRole('heading', {
        level: 2,
        name: lang === 'ar' ? 'التتابع' : 'Relay',
        exact: true,
      }),
    ).toBeVisible();
    await expect(page.getByTestId('game-referees')).toContainText(
      `${labels.player.referee}: ${lang === 'ar' ? 'مينا الحكم' : 'Mina Referee'}`,
    );
    await page.goto('/home');
    await page.getByRole('button', { name: new RegExp('^' + labels['team.switch']) }).click();
    await expect(page.locator('dialog')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.locator('dialog')).toHaveCount(0);
    expect(await page.evaluate((key) => localStorage.getItem(key), `bts.team.${eventId}`)).toBe(
      'T01',
    );
    // Round 1 has started in this fixture, so the player keeps the chosen team (D035).
    await page.getByRole('button', { name: new RegExp('^' + labels['team.switch']) }).click();
    await expect(page.locator('dialog').getByTestId('team-locked')).toHaveText(
      labels.player.teamLocked,
    );
    await expect(
      page.locator('dialog').getByRole('button', { name: labels['team.switch'], exact: true }),
    ).toHaveCount(0);
    await page.keyboard.press('Escape');
    await page.goto('/choose-team');
    await expect(page.getByTestId('team-locked')).toBeVisible();
    await expect(page.getByTestId('team-card-T02')).toBeDisabled();
    await expect(page.getByTestId('confirm-team')).toHaveCount(0);
    await page.goto('/home');
    await expect(
      page.getByRole('heading', { level: 2, name: teamName(0), exact: true }),
    ).toBeVisible();
    await page.screenshot({ path: `artifacts/player-home-${lang}.png`, fullPage: true });
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
    await page.goto('/about');
    await expect(page.getByText('ONE TEAM. ONE SPIRIT.', { exact: true }).last()).toBeVisible();
    await expect(page.getByText('What Would Jesus Do?', { exact: false })).toBeVisible();
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  });
}

test('QR team link requires confirmation even when a different team is saved', async ({ page }) => {
  await page.addInitScript((key) => {
    localStorage.setItem(key, 'T02');
    localStorage.setItem('bts.lang', 'en');
  }, `bts.team.${eventId}`);
  await mockPublicEvent(page, { beforeStart: true });
  await page.goto('/?team=T01');
  await expect(page).toHaveURL(/choose-team.*team=T01/);
  await expect(page.getByTestId('confirm-team')).toBeVisible();
  expect(await page.evaluate((key) => localStorage.getItem(key), `bts.team.${eventId}`)).toBe(
    'T02',
  );
  await page.getByTestId('confirm-team').click();
  await expect(page.getByRole('heading', { level: 2, name: 'Falcons', exact: true })).toBeVisible();
});

test('overtime counts up without closing the round and invalid team links stay unselected', async ({
  page,
}) => {
  await page.addInitScript((key) => {
    localStorage.setItem(key, 'T01');
    localStorage.setItem('bts.lang', 'en');
  }, `bts.team.${eventId}`);
  await mockPublicEvent(page, { overtime: true });
  await page.goto('/home');
  await expect(page.getByRole('timer')).toContainText('+01:');
  await expect(
    page.getByText("Time's up — waiting for the admin to close the round"),
  ).toBeVisible();
  await page.goto('/?team=BAD');
  await expect(page).toHaveURL(/choose-team/);
  await expect(page.getByTestId('confirm-team')).toHaveCount(0);
  expect(await page.evaluate((key) => localStorage.getItem(key), `bts.team.${eventId}`)).toBe(
    'T01',
  );
});

test('players switch freely before the first round starts', async ({ page }) => {
  await page.addInitScript((key) => {
    localStorage.setItem(key, 'T01');
    localStorage.setItem('bts.lang', 'en');
  }, `bts.team.${eventId}`);
  await mockPublicEvent(page, { beforeStart: true });
  await page.goto('/home');
  await page.getByRole('button', { name: /^Switch team/ }).click();
  await page.locator('dialog').getByRole('button', { name: 'Switch team', exact: true }).click();
  await page.getByTestId('team-card-T02').click();
  await page.getByTestId('confirm-team').click();
  await expect(page.getByRole('heading', { level: 2, name: 'Stars', exact: true })).toBeVisible();
});

test('after the first round starts a QR link cannot move a player to another team, but a first pick works', async ({
  page,
}) => {
  const labels = JSON.parse(readFileSync('public/i18n/en.json', 'utf8'));
  await page.addInitScript((key) => {
    if (!sessionStorage.getItem('seeded')) {
      localStorage.setItem(key, 'T02');
      sessionStorage.setItem('seeded', '1');
    }
    localStorage.setItem('bts.lang', 'en');
  }, `bts.team.${eventId}`);
  await mockPublicEvent(page);
  await page.goto('/?team=T01');
  await expect(page.getByRole('alert')).toHaveText(labels.player.teamLockedLink);
  await expect(page.getByTestId('confirm-team')).toHaveCount(0);
  expect(await page.evaluate((key) => localStorage.getItem(key), `bts.team.${eventId}`)).toBe(
    'T02',
  );
  // A device that never picked a team can still join after the lock.
  await page.evaluate((key) => localStorage.removeItem(key), `bts.team.${eventId}`);
  await page.goto('/?team=T01');
  await page.getByTestId('confirm-team').click();
  await expect(page.getByRole('heading', { level: 2, name: 'Falcons', exact: true })).toBeVisible();
});
