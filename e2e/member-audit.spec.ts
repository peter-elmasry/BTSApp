import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { mockOwner } from './owner-fixtures';

test.use({ serviceWorkers: 'block' });
for (const lang of ['en', 'ar'] as const) {
  test(`uncertain member action shows a review reference without success in ${lang}`, async ({
    page,
  }) => {
    const labels = JSON.parse(readFileSync(`public/i18n/${lang}.json`, 'utf8')).owner;
    await mockOwner(page, lang);
    let submissions = 0;
    await page.route('**/functions/v1/members', async (route) => {
      const headers = {
        'access-control-allow-origin': '*',
        'access-control-allow-headers': '*',
        'access-control-allow-methods': '*',
      };
      if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers });
      submissions++;
      return route.fulfill({
        status: 202,
        headers,
        json: {
          ok: false,
          status: 'needs_review',
          operation_id: '29000000-0000-0000-0000-000000000099',
        },
      });
    });
    await page.goto('/owner/members');
    const form = page.locator('app-owner-page form').first();
    await form.locator('[formControlName=username]').fill('new_guide');
    await form.locator('[formControlName=full_name_en]').fill('Test Guide');
    await form.locator('[formControlName=password]').fill('synthetic-test-password');
    await form.getByRole('button', { name: labels.createMember, exact: true }).click();
    const warning = page.locator('app-owner-page [role=alert]');
    await expect(warning).toContainText(labels.memberOperationPending);
    await expect(warning).toContainText('29000000-0000-0000-0000-000000000099');
    await expect(page.locator('app-owner-page [role=status]')).toHaveCount(0);
    await expect(form.locator('[formControlName=password]')).toHaveValue('');
    expect(submissions).toBe(1);
  });
}
