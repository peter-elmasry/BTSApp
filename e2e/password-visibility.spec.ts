import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Locator } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { mockLiveEvent } from './live-fixtures';
import { mockOwner } from './owner-fixtures';
import { mockPublicEvent } from './public-fixtures';

test.use({ serviceWorkers: 'block' });

async function togglePassword(input: Locator, t: Record<string, string>) {
  await expect(input).toHaveAttribute('type', 'password');
  await input.fill('synthetic-test-value');
  const wrapper = input.locator('..');
  const show = wrapper.getByRole('button', { name: t['auth.showPassword'], exact: true });
  await expect(show).toHaveAttribute('aria-controls', (await input.getAttribute('id'))!);
  await expect(show).toHaveAttribute('aria-pressed', 'false');
  const box = (await show.boundingBox())!;
  expect(box.width).toBeGreaterThanOrEqual(44);
  expect(box.height).toBeGreaterThanOrEqual(44);
  await show.click();
  await expect(input).toHaveAttribute('type', 'text');
  await expect(input).toHaveValue('synthetic-test-value');
  const hide = wrapper.getByRole('button', { name: t['auth.hidePassword'], exact: true });
  await expect(hide).toHaveAttribute('aria-pressed', 'true');
  await hide.press('Space');
  await expect(input).toHaveAttribute('type', 'password');
  await expect(input).toHaveValue('synthetic-test-value');
}

for (const lang of ['en', 'ar'] as const) {
  const t = JSON.parse(readFileSync(`public/i18n/${lang}.json`, 'utf8'));

  test(`login eye toggles by touch and keyboard without submitting in ${lang}`, async ({
    page,
  }) => {
    await mockPublicEvent(page);
    await page.addInitScript((value) => localStorage.setItem('bts.lang', value), lang);
    let writes = 0;
    page.on('request', (request) => {
      if (request.url().includes('/functions/v1/login')) writes++;
    });
    await page.goto('/login');
    const password = page.getByLabel(t['auth.password'], { exact: true });
    await togglePassword(password, t);
    await expect(password).toHaveAttribute('autocomplete', 'current-password');
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
    expect(writes).toBe(0);
    await page.screenshot({ path: `artifacts/password-eye-${lang}.png`, fullPage: true });
    await page.reload();
    await expect(password).toHaveAttribute('type', 'password');
  });

  test(`new password and confirmation eyes are independent in ${lang}`, async ({ page }) => {
    await mockLiveEvent(page, { role: 'REFEREE', lang });
    await page.goto('/account/password');
    const password = page.getByLabel(t['account.newPassword'], { exact: true });
    const confirm = page.getByLabel(t['account.confirmPassword'], { exact: true });
    await togglePassword(password, t);
    await password.locator('..').getByRole('button').click();
    await expect(confirm).toHaveAttribute('type', 'password');
    await togglePassword(confirm, t);
    await expect(password).toHaveAttribute('type', 'text');
    await expect(password).toHaveAttribute('autocomplete', 'new-password');
  });

  test(`owner create and reset passwords share eye controls in ${lang}`, async ({ page }) => {
    await mockOwner(page, lang);
    let writes = 0;
    page.on('request', (request) => {
      if (request.url().includes('/functions/v1/members')) writes++;
    });
    await page.goto('/owner/members');
    await page.getByRole('button', { name: t.owner.createMember, exact: false }).click();
    let sheet = page.getByRole('dialog');
    await togglePassword(sheet.getByLabel(t.owner.initialPassword, { exact: true }), t);
    await sheet.getByRole('button', { name: t.common.cancel, exact: true }).click();
    await page.getByTestId('member-actions').first().click();
    await page
      .getByTestId('member-action-sheet')
      .getByRole('button', { name: t.owner.setPassword })
      .click();
    sheet = page.getByRole('dialog');
    const password = sheet.getByLabel(t['account.newPassword'], { exact: true });
    const confirm = sheet.getByLabel(t['account.confirmPassword'], { exact: true });
    await togglePassword(password, t);
    await togglePassword(confirm, t);
    await password.locator('..').getByRole('button').click();
    await sheet.getByRole('button', { name: t.common.cancel, exact: true }).click();
    await page.getByTestId('member-actions').first().click();
    await page
      .getByTestId('member-action-sheet')
      .getByRole('button', { name: t.owner.setPassword })
      .click();
    await expect(password).toHaveAttribute('type', 'password');
    expect(writes).toBe(0);
  });
}
