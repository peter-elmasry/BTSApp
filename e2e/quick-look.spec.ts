import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { mockLiveEvent } from './live-fixtures';
import { eventId, mockPublicEvent } from './public-fixtures';

test.use({ serviceWorkers: 'block' });

test('visitors open a quick look for their own team only (D055)', async ({ page }) => {
  await page.addInitScript((id) => localStorage.setItem(`bts.team.${id}`, 'T01'), eventId);
  await mockPublicEvent(page);
  await page.goto('/schedule');
  await expect(page.getByTestId('team-link-T02')).toHaveCount(0);
  await page.getByTestId('team-link-T01').first().click();
  await expect(page.getByTestId('quick-look-team')).toBeVisible();
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('quick-look-team')).toHaveCount(0);
});

test('members open a quick look for any game (D055)', async ({ page }) => {
  await mockLiveEvent(page, { role: 'REFEREE', lang: 'en' });
  await page.goto('/schedule');
  await page.locator('[data-testid^="game-link-"]').first().click();
  await expect(page.getByTestId('quick-look-game')).toBeVisible();
});
