import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { mockOwner } from './owner-fixtures';
import { eventId } from './public-fixtures';

test.use({ serviceWorkers: 'block' });
const labels = (lang: string) => JSON.parse(readFileSync(`public/i18n/${lang}.json`, 'utf8'));

async function noHorizontalOverflow(page: Page) {
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
}

for (const lang of ['ar', 'en'] as const) {
  test(`staff screens share one section bar and fit 360 px in ${lang}`, async ({ page }) => {
    const t = labels(lang);
    await mockOwner(page, lang);
    // The section bar is for tablets and desktops; phones use the bottom bar and More.
    await page.setViewportSize({ width: 1024, height: 800 });
    await page.goto(`/manage/${eventId}/live`);
    const nav = page.getByRole('navigation', { name: t.manage.nav.label });
    await expect(nav.getByRole('link', { name: t.manage.nav.control })).toHaveAttribute(
      'aria-current',
      'page',
    );
    await noHorizontalOverflow(page);
    await nav.getByRole('link', { name: t.manage.nav.setup }).click();
    await expect(page).toHaveURL(new RegExp(`/manage/${eventId}/setup`));
    await expect(nav.getByRole('link', { name: t.manage.nav.setup })).toHaveAttribute(
      'aria-current',
      'page',
    );
    await noHorizontalOverflow(page);
    await page.setViewportSize({ width: 360, height: 740 });
    await expect(nav).toBeHidden();
    await noHorizontalOverflow(page);
    const results = await new AxeBuilder({ page }).analyze();
    expect(results.violations).toEqual([]);
  });

  test(`owner remove-admin is a full touch target and passwords use a masked sheet in ${lang}`, async ({
    page,
  }) => {
    const t = labels(lang);
    await mockOwner(page, lang);
    await page.goto('/owner/events');
    const remove = page.getByTestId('remove-admin');
    await expect(remove).toBeVisible();
    const box = (await remove.boundingBox())!;
    expect(box.width).toBeGreaterThanOrEqual(44);
    expect(box.height).toBeGreaterThanOrEqual(44);
    await noHorizontalOverflow(page);

    await page.goto('/owner/members');
    let prompted = false;
    page.on('dialog', (dialog) => {
      prompted = true;
      void dialog.dismiss();
    });
    await page.getByTestId('member-actions').first().click();
    await page
      .getByTestId('member-action-sheet')
      .getByRole('button', { name: t.owner.setPassword })
      .click();
    const sheet = page.getByRole('dialog');
    await expect(sheet).toBeVisible();
    const password = sheet.getByLabel(t['account.newPassword'], { exact: true });
    const confirm = sheet.getByLabel(t['account.confirmPassword'], { exact: true });
    await expect(password).toHaveAttribute('type', 'password');
    await expect(confirm).toHaveAttribute('type', 'password');
    await password.fill('short');
    await confirm.fill('short');
    await sheet.getByRole('button', { name: t.owner.setPassword }).click();
    await expect(sheet.getByRole('alert')).toHaveText(t.owner.passwordTooShort);
    expect(prompted).toBe(false);
  });
}
