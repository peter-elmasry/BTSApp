import { expect, test } from '@playwright/test';
import { mockLiveEvent } from './live-fixtures';
import { eventId } from './public-fixtures';

test.use({ serviceWorkers: 'block' });

test('signed-in referees open the full schedule without picking a team', async ({ page }) => {
  await mockLiveEvent(page, { role: 'REFEREE', lang: 'en' });
  // The shared fixture stores a team; a referee normally has none on this device.
  await page.addInitScript((key) => localStorage.removeItem(key), `bts.team.${eventId}`);
  await page.goto('/schedule');
  await expect(page).toHaveURL(/\/schedule$/);
  await expect(page.getByRole('button', { name: 'By round' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await expect(page.getByRole('button', { name: 'My team' })).toHaveCount(0);
});
