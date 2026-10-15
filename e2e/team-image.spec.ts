import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import sharp from 'sharp';
import { mockOwner } from './owner-fixtures';
import { bootstrap, eventId, mockPublicEvent } from './public-fixtures';

test.use({ serviceWorkers: 'block' });
const headers = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': '*',
  'access-control-allow-methods': '*',
};
for (const lang of ['en', 'ar'] as const) {
  test(`team picture upload and removal in ${lang}`, async ({ page }) => {
    await mockOwner(page, lang);
    const labels = JSON.parse(readFileSync(`public/i18n/${lang}.json`, 'utf8'));
    const team = { ...bootstrap.teams[0], image_path: null as string | null };
    await page.route('**/rest/v1/rpc/get_event_setup', (route) =>
      route.fulfill({
        headers,
        json: {
          event: { id: eventId, code: 'PIC', name_en: 'Pictures' },
          teams: [team],
          games: [],
          rounds: [],
        },
      }),
    );
    let uploaded = 0;
    await page.route('**/storage/v1/object/team-images/**', (route) => {
      if (route.request().method() === 'OPTIONS') return route.fulfill({ headers, status: 204 });
      uploaded++;
      const bytes = route.request().postDataBuffer()!;
      expect(bytes.includes(Buffer.from('WEBP'))).toBe(true);
      return route.fulfill({ headers, json: { Key: 'photo.webp' } });
    });
    await page.route('**/rest/v1/rpc/upsert_team', (route) => {
      if (route.request().method() === 'OPTIONS') return route.fulfill({ headers, status: 204 });
      Object.assign(team, route.request().postDataJSON().p_team);
      return route.fulfill({ headers, json: team });
    });
    await page.goto(`/manage/${eventId}/setup`);
    await page.getByRole('button', { name: labels.manage.tab.teams, exact: true }).click();
    const form = page.locator('form').filter({ has: page.getByTestId('team-image-input') });
    await page.getByRole('button', { name: labels.common.edit, exact: true }).click();
    const buffer = await sharp({
      create: { width: 2048, height: 1024, channels: 4, background: '#123456' },
    })
      .png()
      .toBuffer();
    await page
      .getByTestId('team-image-input')
      .setInputFiles({ name: 'photo.png', mimeType: 'image/png', buffer });
    const preview = form.getByRole('img', { name: labels.manage.teamImage, exact: true });
    await expect(preview).toBeVisible();
    await expect
      .poll(() =>
        preview.evaluate((img: HTMLImageElement) => [img.naturalWidth, img.naturalHeight]),
      )
      .toEqual([1024, 512]);
    await form.getByRole('button', { name: labels.common.save, exact: true }).click();
    await expect.poll(() => team.image_path).toMatch(new RegExp(`^${eventId}/[a-f0-9-]+[.]webp$`));
    await expect(form.locator('[formControlName=code]')).toHaveValue('');
    expect(uploaded).toBe(1);
    await page.getByRole('button', { name: labels.common.edit, exact: true }).click();
    await form.getByRole('button', { name: labels.manage.removeTeamImage, exact: true }).click();
    await form.getByRole('button', { name: labels.common.save, exact: true }).click();
    await expect.poll(() => team.image_path).toBeNull();
    expect(uploaded).toBe(1);
    await page
      .getByTestId('team-image-input')
      .setInputFiles({ name: 'broken.png', mimeType: 'image/png', buffer: Buffer.from('broken') });
    await expect(page.getByText(labels.manage.invalidImage)).toBeVisible();
  });
  test(`anonymous team picture and avatar fallback in ${lang}`, async ({ page }) => {
    await page.addInitScript((value) => localStorage.setItem('bts.lang', value), lang);
    await mockPublicEvent(page);
    const path = `${eventId}/55000000-0000-0000-0000-000000000001.webp`;
    const nextPath = `${eventId}/55000000-0000-0000-0000-000000000002.webp`;
    await page.route('**/rest/v1/rpc/get_bootstrap', (route) =>
      route.fulfill({
        headers,
        json: {
          ...bootstrap,
          teams: bootstrap.teams.map((team, index) => ({
            ...team,
            image_path: index === 0 ? path : nextPath,
          })),
        },
      }),
    );
    const buffer = await sharp({
      create: { width: 80, height: 80, channels: 4, background: '#123456' },
    })
      .webp()
      .toBuffer();
    await page.route(`**/storage/v1/object/public/team-images/${path}`, (route) =>
      route.fulfill({ headers, contentType: 'image/webp', body: buffer }),
    );
    await page.route(`**/storage/v1/object/public/team-images/${nextPath}`, (route) =>
      route.fulfill({ headers, status: 404 }),
    );
    await page.goto('/choose-team');
    const first = page.getByTestId('team-card-T01').locator('ds-avatar img');
    await expect(first).toHaveAttribute('src', new RegExp('/team-images/'));
    await expect.poll(() => first.evaluate((img: HTMLImageElement) => img.naturalWidth)).toBe(80);
    await expect(page.getByTestId('team-card-T02').locator('ds-avatar img')).toHaveAttribute(
      'src',
      '/avatars/star.svg',
    );
  });
}
