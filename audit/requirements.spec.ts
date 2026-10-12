import { expect, test } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { mockStandingsEvent } from '../e2e/standings-fixtures';
import { mockOwner as owner } from '../e2e/owner-fixtures';
import { eventId } from '../e2e/public-fixtures';

test.use({ serviceWorkers: 'block' });
test('owner data clears when another tab signs out', async ({ page }) => {
  await owner(page);
  await page.goto('/owner/members');
  await expect(page.getByText('+201000000001')).toBeVisible();
  const second = await page.context().newPage();
  await owner(second);
  await second.goto('/owner/members');
  await expect(second.getByText('+201000000001')).toBeVisible();
  await second.locator('header').first().getByRole('button', { name: 'تسجيل الخروج' }).click();
  await expect(
    second.locator('header').first().getByRole('link', { name: 'تسجيل الدخول' }),
  ).toBeVisible();
  await expect(
    page.locator('header').first().getByRole('link', { name: 'تسجيل الدخول' }),
  ).toBeVisible();
  await expect(page.getByText('+201000000001')).toHaveCount(0);
});

test('owner remove-admin action is a 44px touch target', async ({ page }) => {
  await owner(page);
  await page.goto('/owner/events');
  const button = page.locator('app-owner-page li button');
  await expect(button).toBeVisible();
  const box = await button.boundingBox();
  expect.soft(box!.height).toBeGreaterThanOrEqual(44);
  expect.soft(box!.width).toBeGreaterThanOrEqual(44);
});

test('Arabic setup renders the Arabic team name', async ({ page }) => {
  await mockStandingsEvent(page, { role: 'EVENT_ADMIN', lang: 'ar' });
  await page.goto(`/manage/${eventId}/setup`);
  await page.getByRole('button', { name: 'الفرق', exact: true }).click();
  await expect(page.locator('app-event-setup-page article h3').first()).toContainText('الصقور');
});

test('game photos accept PNG for WebP conversion', async ({ page }) => {
  await mockStandingsEvent(page, { role: 'EVENT_ADMIN', lang: 'en' });
  await page.goto(`/manage/${eventId}/setup`);
  await page.getByRole('button', { name: 'Games', exact: true }).click();
  await page.locator('input[type=file]').setInputFiles({
    name: 'game.png',
    mimeType: 'image/png',
    buffer: Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=',
      'base64',
    ),
  });
  await expect(page.locator('app-event-setup-page img')).toBeVisible();
});

for (const lang of ['en', 'ar'] as const) {
  test(`390px reduced-motion leaderboard in ${lang}`, async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await mockStandingsEvent(page, { lang });
    await page.goto('/leaderboard');
    await expect(page.locator('app-standings-list [data-team-id]')).toHaveCount(2);
    expect(
      await page
        .locator('app-standings-list')
        .evaluate(
          (el) =>
            el.getAnimations({ subtree: true }).filter((a) => a.playState === 'running').length,
        ),
    ).toBe(0);
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  });
}
