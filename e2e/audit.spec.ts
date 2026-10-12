import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { mockOwner } from './owner-fixtures';
import { eventId } from './public-fixtures';

test.use({ serviceWorkers: 'block' });
for (const lang of ['en', 'ar'] as const) {
  test(`audit filters, pagination and mobile accessibility ${lang}`, async ({ page }) => {
    await mockOwner(page, lang);
    const requests: Record<string, unknown>[] = [];
    const row = (id: string, action: string) => ({
      id,
      action,
      entity: 'team',
      entity_id: eventId,
      at: '2026-10-12T08:00:00Z',
      actor: { name_en: 'Audit Admin', name_ar: 'مسؤول السجل' },
      before: null,
      after: { name_en: '<script>unsafe()</script>', name_ar: 'فريق جديد' },
    });
    await page.route('**/rest/v1/rpc/get_audit_log', async (route) => {
      const headers = {
        'access-control-allow-origin': '*',
        'access-control-allow-headers': '*',
        'access-control-allow-methods': '*',
      };
      if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers });
      const args = route.request().postDataJSON();
      requests.push(args);
      const items = args.p_action
        ? [row('2', 'TEAM_CREATED')]
        : args.p_before
          ? [row('2', 'TEAM_CREATED')]
          : [row('3', 'TEAM_UPDATED')];
      return route.fulfill({
        headers,
        json: {
          items,
          next_before: args.p_action || args.p_before ? null : '3',
          actions: ['TEAM_CREATED', 'TEAM_UPDATED'],
          entities: ['team'],
        },
      });
    });
    await page.goto(`/manage/${eventId}/audit`);
    await expect(
      page.getByRole('heading', { name: lang === 'en' ? 'Audit log' : 'سجل التغييرات' }),
    ).toBeVisible();
    await expect(page.getByTestId('audit-entry')).toHaveCount(1);
    await page
      .getByRole('button', { name: lang === 'en' ? 'Load older entries' : 'تحميل تغييرات أقدم' })
      .click();
    await expect(page.getByTestId('audit-entry')).toHaveCount(2);
    expect(requests.at(-1)?.['p_before']).toBe('3');
    await page
      .getByRole('combobox', { name: lang === 'en' ? 'Action' : 'الإجراء', exact: true })
      .selectOption('TEAM_CREATED');
    await page
      .getByRole('button', { name: lang === 'en' ? 'Apply filters' : 'تطبيق التصفية' })
      .click();
    await expect(page.getByTestId('audit-entry')).toHaveCount(1);
    expect(requests.at(-1)?.['p_action']).toBe('TEAM_CREATED');
    expect(requests.at(-1)?.['p_before']).toBeNull();
    await page.locator('app-audit-page summary').click();
    await expect(page.locator('app-audit-page pre').last()).toContainText(
      '<script>unsafe()</script>',
    );
    await expect(page.locator('app-audit-page script')).toHaveCount(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    expect((await new AxeBuilder({ page }).include('app-audit-page').analyze()).violations).toEqual(
      [],
    );
    await page.screenshot({ path: `artifacts/audit-${lang}.png`, fullPage: true });
  });
}
