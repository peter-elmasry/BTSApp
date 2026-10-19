import { expect, test, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { mockLiveEvent } from './live-fixtures';
import { mockOwner } from './owner-fixtures';
import { eventId, mockPublicEvent } from './public-fixtures';

test.use({ serviceWorkers: 'block' });
const labels = (lang: string) => JSON.parse(readFileSync(`public/i18n/${lang}.json`, 'utf8'));
const mainNav = (page: Page, t: Record<string, any>) =>
  page.getByRole('navigation', { name: t.common.navigation });

async function asGuide(page: Page, teamId: string) {
  await page.route('**/rest/v1/rpc/get_my_profile', (route) =>
    route.request().method() === 'OPTIONS'
      ? route.fallback()
      : route.fulfill({
          headers: { 'access-control-allow-origin': '*' },
          json: {
            id: 'guide-member',
            username: 'guide',
            phone: null,
            full_name_en: 'Mariam Guide',
            full_name_ar: 'مريم المرشدة',
            system_role: 'MEMBER',
            roles: [{ event_id: eventId, role: 'GUIDE', team_id: teamId }],
            assigned_games: [],
          },
        }),
  );
}

for (const lang of ['ar', 'en'] as const) {
  test(`each role lands on its own start page with its own navigation in ${lang}`, async ({
    page,
  }) => {
    const t = labels(lang);
    await mockLiveEvent(page, { role: 'REFEREE', lang });
    await page.goto('/');
    await expect(page).toHaveURL(/\/ref$/);
    const nav = mainNav(page, t);
    await expect(nav.getByRole('link', { name: t['nav.myStation'] })).toHaveAttribute(
      'aria-current',
      'page',
    );
    await expect(nav.getByRole('button', { name: t['nav.more'] })).toBeVisible();
  });

  test(`admins land on Control with Import/Export always visible in ${lang}`, async ({ page }) => {
    const t = labels(lang);
    await mockLiveEvent(page, { role: 'EVENT_ADMIN', lang });
    await page.goto('/');
    await expect(page).toHaveURL(new RegExp(`/manage/${eventId}/live$`));
    // Phones use the bottom bar and More; the section bar and toolbar are for wider screens.
    await page.goto(`/manage/${eventId}/live`);
    await expect(page.getByTestId('toolbar-import')).toBeHidden();
    await page.setViewportSize({ width: 1024, height: 800 });
    for (const section of ['live', 'setup', 'audit']) {
      await page.goto(`/manage/${eventId}/${section}`);
      await expect(page.getByTestId('toolbar-import')).toContainText(t.manage.toolbar.import);
      await expect(page.getByTestId('toolbar-export')).toContainText(t.manage.toolbar.export);
      await expect(
        page.getByRole('navigation', { name: t.manage.nav.label }).getByRole('link'),
      ).toHaveCount(7);
      await expect(
        page
          .getByRole('navigation', { name: t.manage.nav.label })
          .getByRole('link', { name: t.eventReport.recap }),
      ).toBeVisible();
    }
    await page.setViewportSize({ width: 360, height: 740 });
    const nav = mainNav(page, t);
    await expect(nav.getByRole('link', { name: t['nav.control'] })).toBeVisible();
    await nav.getByRole('button', { name: t['nav.more'] }).click();
    const menu = page.getByTestId('staff-menu');
    await expect(menu.getByRole('link', { name: t.manage.toolbar.import })).toBeVisible();
    await expect(menu.getByRole('link', { name: t.manage.toolbar.export })).toBeVisible();
    await expect(menu.getByText(t.menu.role.EVENT_ADMIN)).toBeVisible();
  });

  test(`owners land on the current event control screen in ${lang}`, async ({ page }) => {
    await mockOwner(page, lang);
    await page.goto('/');
    await expect(page).toHaveURL(new RegExp(`/manage/${eventId}/live$`));
  });

  test(`a signed-in guide follows their team after the lock in ${lang}`, async ({ page }) => {
    const t = labels(lang);
    await mockLiveEvent(page, { role: 'REFEREE', lang });
    await asGuide(page, 'team-2');
    await page.goto('/');
    await expect(page).toHaveURL(/127\.0\.0\.1:\d+\/(home)?$/);
    await expect
      .poll(() => page.evaluate((id) => localStorage.getItem(`bts.team.${id}`), eventId))
      .toBe('T02');
    await expect(page.getByTestId('guide-chip')).toHaveText(t['team.guide']);
    await expect(mainNav(page, t).getByRole('link', { name: t['nav.home'] })).toBeVisible();
  });

  test(`players open the Now sheet from the round banner in ${lang}`, async ({ page }) => {
    const t = labels(lang);
    await page.addInitScript(
      ({ lang, eventId }) => {
        localStorage.setItem('bts.lang', lang);
        localStorage.setItem(`bts.team.${eventId}`, 'T01');
      },
      { lang, eventId },
    );
    await mockPublicEvent(page);
    await page.goto('/home');
    await page.getByTestId('round-banner').click();
    const sheet = page.getByTestId('now-sheet');
    await expect(sheet.getByTestId('now-my-match')).toContainText(
      lang === 'ar' ? 'الملعب الرئيسي' : 'Main court',
    );
    await expect(sheet.getByTestId('now-next-match')).toBeVisible();
    await expect(page.getByRole('dialog', { name: t.now.title })).toBeVisible();
  });
}
