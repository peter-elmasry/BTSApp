import { expect, test } from '@playwright/test';
import { mockOwner } from './owner-fixtures';
import { mockStandingsEvent } from './standings-fixtures';
import { eventId, matches } from './public-fixtures';

test.use({ serviceWorkers: 'block' });

for (const [path, selector] of [
  ['/owner/members', 'app-owner-page'],
  ['/owner/events', 'app-owner-page'],
  [`/manage/${eventId}/setup`, 'app-event-setup-page'],
  [`/manage/${eventId}/import`, 'app-event-import-page'],
  [`/manage/${eventId}/live`, 'app-live-control-page'],
  [`/manage/${eventId}/standings`, 'app-manage-standings-page'],
  [`/manage/${eventId}/audit`, 'app-audit-page'],
  ['/ref', 'app-referee-board-page'],
  [`/ref/match/${matches[0].id}`, 'app-match-entry-page'],
]) {
  test(`cross-tab logout destroys the open ${path} screen`, async ({ page }) => {
    await mockStandingsEvent(page, { role: 'EVENT_ADMIN', lang: 'ar' });
    await mockOwner(page);
    await page.goto(path);
    await expect(page.locator(selector)).toBeVisible();
    if (path === '/owner/members') await expect(page.getByText('+201000000001')).toBeVisible();
    const second = await page.context().newPage();
    await mockOwner(second);
    await second.goto('/owner/members');
    await expect(second.getByText('+201000000001')).toBeVisible();
    await second.getByTestId('account-menu').click();
    await second.getByTestId('staff-menu').getByRole('button', { name: 'تسجيل الخروج' }).click();
    await expect(page.locator('header').getByRole('link', { name: 'تسجيل الدخول' })).toBeVisible();
    await expect(page.locator(selector)).toHaveCount(0);
    await expect(page.getByText('+201000000001')).toHaveCount(0);
    await expect(page).toHaveURL(/\/(home|choose-team)(\?|$)/);
    await second.close();
  });
}
