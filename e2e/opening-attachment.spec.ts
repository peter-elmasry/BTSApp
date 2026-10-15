import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import sharp from 'sharp';
import { bootstrap, eventId, mockPublicEvent } from './public-fixtures';
import { mockOwner } from './owner-fixtures';

test.use({ serviceWorkers: 'block' });
const roundId = '66000000-0000-0000-0000-000000000000';
const assetId = '55000000-0000-0000-0000-000000000001';
const headers = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': '*',
  'access-control-allow-methods': '*',
};
for (const lang of ['en', 'ar'] as const) {
  test(`opening attachment is public before team choice in ${lang}`, async ({ page }) => {
    await page.addInitScript((value) => localStorage.setItem('bts.lang', value), lang);
    await mockPublicEvent(page);
    let attachment: unknown = {
      path: `${eventId}/${roundId}/${assetId}.webp`,
      mime: 'image/webp',
      title: 'Opening instructions',
    };
    await page.route('**/rest/v1/rpc/get_bootstrap', (route) =>
      route.fulfill({
        headers,
        json: {
          ...bootstrap,
          rounds: [
            { ...bootstrap.rounds[0], id: roundId, number: 0, type: 'OPENING', attachment },
            ...bootstrap.rounds,
          ],
        },
      }),
    );
    const image = await sharp({
      create: { width: 200, height: 100, channels: 4, background: '#123456' },
    })
      .webp()
      .toBuffer();
    await page.route('**/storage/v1/object/public/opening-attachments/**', (route) =>
      route.fulfill({ headers, contentType: 'image/webp', body: image }),
    );
    await page.goto('/choose-team');
    await expect(page.getByTestId('opening-attachment')).toBeVisible();
    await expect(page.getByTestId('opening-attachment').getByRole('img')).toBeVisible();
    await page.screenshot({ path: `artifacts/opening-public-${lang}.png`, fullPage: true });
    await page.goto('/display');
    await expect(page).toHaveURL(/\/display$/);
    await expect(page.getByTestId('opening-attachment')).toBeVisible();
    await expect(page.locator('app-display-page [data-team-id]')).toHaveCount(0);
    attachment = {
      path: `${eventId}/${roundId}/${assetId}.pdf`,
      mime: 'application/pdf',
      title: 'Opening PDF',
    };
    await page.goto('/choose-team');
    const card = page.getByTestId('opening-attachment');
    await expect(card.locator('iframe')).toHaveAttribute('title', 'Opening PDF');
    await expect(card.getByRole('link')).toHaveAttribute('href', new RegExp('[.]pdf$'));
    attachment = null;
    await page.reload();
    await expect(page.getByTestId('team-card-T01')).toBeVisible();
    await expect(page.getByTestId('opening-attachment')).toHaveCount(0);
  });
  test(`admin uploads a PDF and controls public display in ${lang}`, async ({ page }) => {
    await mockOwner(page, lang);
    const labels = JSON.parse(readFileSync(`public/i18n/${lang}.json`, 'utf8'));
    const round = {
      id: roundId,
      number: 0,
      type: 'OPENING',
      duration_min: 10,
      status: 'ACTIVE',
      name_en: 'Opening',
      attachment_path: null as string | null,
      attachment_mime: null as string | null,
      attachment_title: null as string | null,
      attachment_visible: false,
    };
    await page.route('**/rest/v1/rpc/get_event_setup', (route) =>
      route.fulfill({
        headers,
        json: {
          event: { id: eventId, code: 'ATT', name_en: 'Attachments' },
          teams: [],
          games: [],
          rounds: [round],
        },
      }),
    );
    let uploaded = 0;
    await page.route('**/storage/v1/object/opening-attachments/**', (route) => {
      if (route.request().method() === 'OPTIONS') return route.fulfill({ headers, status: 204 });
      uploaded++;
      expect(route.request().postDataBuffer()!.includes(Buffer.from('%PDF-'))).toBe(true);
      return route.fulfill({ headers, json: { Key: 'attachment.pdf' } });
    });
    await page.route('**/rest/v1/rpc/set_opening_attachment', (route) => {
      if (route.request().method() === 'OPTIONS') return route.fulfill({ headers, status: 204 });
      const data = route.request().postDataJSON();
      round.attachment_path = data.p_path;
      round.attachment_mime = data.p_mime;
      round.attachment_title = data.p_title;
      round.attachment_visible = data.p_visible;
      return route.fulfill({ headers, json: {} });
    });
    await page.goto(`/manage/${eventId}/setup`);
    await page.getByRole('button', { name: labels.manage.tab.rounds, exact: true }).click();
    const editor = page.getByTestId('opening-editor');
    await editor.locator('input[type=file]').setInputFiles({
      name: 'instructions.pdf',
      mimeType: 'application/pdf',
      buffer: Buffer.from('%PDF-1.7\n%%EOF'),
    });
    await expect(editor.getByText('instructions.pdf')).toBeVisible();
    await editor.getByLabel(labels.attachment.title).fill('Opening guide');
    await editor.getByLabel(labels.attachment.visible).check();
    await editor.getByRole('button', { name: labels.common.save, exact: true }).click();
    await expect.poll(() => round.attachment_visible).toBe(true);
    expect(uploaded).toBe(1);
    await editor.getByLabel(labels.attachment.visible).uncheck();
    await editor.getByRole('button', { name: labels.common.save, exact: true }).click();
    await expect.poll(() => round.attachment_visible).toBe(false);
    await editor.getByRole('button', { name: labels.attachment.remove, exact: true }).click();
    await editor.getByRole('button', { name: labels.common.save, exact: true }).click();
    await expect.poll(() => round.attachment_path).toBeNull();
    expect(uploaded).toBe(1);
    await editor.locator('input[type=file]').setInputFiles({
      name: 'fake.pdf',
      mimeType: 'application/pdf',
      buffer: Buffer.from('not PDF'),
    });
    await expect(editor.getByText(labels.attachment.invalid)).toBeVisible();
  });
}
