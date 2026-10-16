import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { mockLiveEvent } from './live-fixtures';
test.use({ serviceWorkers: 'block' });
for (const lang of ['en', 'ar'] as const) {
  test(`password validation explains length and mismatch inline in ${lang}`, async ({ page }) => {
    await mockLiveEvent(page, { role: 'REFEREE', lang });
    const t = JSON.parse(readFileSync(`public/i18n/${lang}.json`, 'utf8'));
    let writes = 0;
    page.on('request', (request) => {
      if (request.url().includes('/functions/v1/members')) writes++;
    });
    await page.goto('/account/password');
    const password = page.getByLabel(t['account.newPassword'], { exact: true });
    const confirm = page.getByLabel(t['account.confirmPassword'], { exact: true });
    await password.fill('short');
    await confirm.fill('short');
    await page.getByRole('button', { name: t['account.save'], exact: true }).click();
    await expect(password).toHaveAttribute('aria-invalid', 'true');
    await expect(password).toHaveAccessibleDescription(t['errors.INVALID_PASSWORD']);
    await password.fill('A-long-valid-password!');
    await confirm.fill('different');
    await page.getByRole('button', { name: t['account.save'], exact: true }).click();
    await expect(password).toHaveAttribute('aria-invalid', 'false');
    await expect(confirm).toHaveAttribute('aria-invalid', 'true');
    await expect(confirm).toHaveAccessibleDescription(t['errors.PASSWORD_MISMATCH']);
    expect(writes).toBe(0);
  });
}
