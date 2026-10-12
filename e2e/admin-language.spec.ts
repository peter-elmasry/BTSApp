import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { mockOwner } from './owner-fixtures';
import { eventId } from './public-fixtures';

test.use({ serviceWorkers: 'block' });
test('admin and owner entity labels switch languages with fallback', async ({ page }) => {
  await mockOwner(page, 'ar');
  const labels = (lang: string) => JSON.parse(readFileSync(`public/i18n/${lang}.json`, 'utf8'));
  const headers = {
    'access-control-allow-origin': '*',
    'access-control-allow-headers': '*',
    'access-control-allow-methods': '*',
  };
  const member = {
    id: 'member',
    username: 'mina',
    full_name_en: 'Mina',
    full_name_ar: 'مينا',
    is_active: true,
    has_login: true,
    system_role: 'MEMBER',
  };
  const event = {
    id: eventId,
    code: 'LANG',
    name_en: 'Festival',
    name_ar: 'المهرجان',
    admin_ids: ['member'],
    status: 'DRAFT',
  };
  await page.route('**/rest/v1/rpc/**', (route) => {
    const name = new URL(route.request().url()).pathname.split('/').at(-1);
    if (!['get_event_setup', 'list_members', 'list_events'].includes(name!))
      return route.fallback();
    if (route.request().method() === 'OPTIONS') return route.fulfill({ headers, status: 204 });
    const json =
      name === 'list_members'
        ? [member]
        : name === 'list_events'
          ? [event]
          : {
              event,
              teams: [
                { id: 'team', code: 'T01', name_en: 'Falcons', name_ar: 'الصقور' },
                { id: 'fallback', code: 'T02', name_en: 'Fallback Team', name_ar: ' ' },
              ],
              games: [
                {
                  id: 'game',
                  code: 'G01',
                  name_en: 'Race',
                  name_ar: 'السباق',
                  location_en: 'Hall',
                  location_ar: 'القاعة',
                },
              ],
              rounds: [
                {
                  id: 'round',
                  number: 1,
                  duration_min: 10,
                  name_en: 'Final',
                  name_ar: 'النهائي',
                  type: 'REGULAR',
                },
              ],
              eligible_members: [member],
              roles: [{ member_id: 'member', role: 'GUIDE', team_id: 'team' }],
            };
    return route.fulfill({ headers, json });
  });
  await page.goto(`/manage/${eventId}/setup`);
  await expect(page.getByText('المهرجان · LANG')).toBeVisible();
  await page.getByRole('button', { name: labels('ar').manage.tab.teams, exact: true }).click();
  await expect(page.getByRole('rowheader', { name: /الصقور\s*T01/ })).toBeVisible();
  await expect(page.getByRole('rowheader', { name: /Fallback Team\s*T02/ })).toBeVisible();
  await page
    .locator('header')
    .first()
    .getByRole('button', {
      name: new RegExp(
        [labels('ar').common.switchLanguage, labels('en').common.switchLanguage].join('|'),
      ),
    })
    .click();
  await expect(page.getByRole('rowheader', { name: /Falcons\s*T01/ })).toBeVisible();
  await page.getByRole('button', { name: labels('en').manage.tab.games, exact: true }).click();
  await expect(page.getByRole('rowheader', { name: /Race\s*G01/ })).toBeVisible();
  await page
    .locator('header')
    .first()
    .getByRole('button', {
      name: new RegExp(
        [labels('ar').common.switchLanguage, labels('en').common.switchLanguage].join('|'),
      ),
    })
    .click();
  await expect(page.getByRole('rowheader', { name: /السباق\s*G01/ })).toBeVisible();
  await expect(page.getByText('القاعة', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: labels('ar').manage.tab.staff, exact: true }).click();
  await expect(page.getByRole('rowheader', { name: 'مينا', exact: true })).toBeVisible();
  await expect(page.getByText('الصقور', { exact: false }).last()).toBeVisible();
  await page.goto('/owner/events');
  await expect(page.getByRole('heading', { name: 'المهرجان (LANG)' })).toBeVisible();
  await expect(page.locator('app-owner-page li').filter({ hasText: 'مينا (@mina)' })).toBeVisible();
  const assertAdminTouchTarget = async (lang: 'ar' | 'en') => {
    // The label adds the member name (D040); match the action as a prefix.
    const remove = page.getByRole('button', { name: labels(lang).owner.removeAdmin });
    const box = await remove.boundingBox();
    expect(box).not.toBeNull();
    expect(box!.width).toBeGreaterThanOrEqual(44);
    expect(box!.height).toBeGreaterThanOrEqual(44);
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true);
  };
  await assertAdminTouchTarget('ar');
  await page
    .locator('header')
    .first()
    .getByRole('button', {
      name: new RegExp(
        [labels('ar').common.switchLanguage, labels('en').common.switchLanguage].join('|'),
      ),
    })
    .click();
  await expect(page.getByRole('heading', { name: 'Festival (LANG)' })).toBeVisible();
  await expect(page.locator('app-owner-page li').filter({ hasText: 'Mina (@mina)' })).toBeVisible();
  await assertAdminTouchTarget('en');
  await page.goto('/owner/members');
  await expect(page.getByRole('rowheader', { name: /مينا\s*@mina/ })).toBeVisible();
  await page
    .locator('header')
    .first()
    .getByRole('button', {
      name: new RegExp(
        [labels('ar').common.switchLanguage, labels('en').common.switchLanguage].join('|'),
      ),
    })
    .click();
  await expect(page.getByRole('rowheader', { name: /Mina\s*@mina/ })).toBeVisible();
});
