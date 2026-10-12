import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import sharp from 'sharp';
import { mockOwner } from './owner-fixtures';
import { eventId } from './public-fixtures';

test.use({ serviceWorkers: 'block' });
for (const lang of ['en', 'ar'] as const) {
  test(`game photos convert and upload safely in ${lang}`, async ({ page }) => {
    await mockOwner(page, lang);
    const labels = JSON.parse(readFileSync(`public/i18n/${lang}.json`, 'utf8'));
    const headers = {
      'access-control-allow-origin': '*',
      'access-control-allow-headers': '*',
      'access-control-allow-methods': '*',
    };
    await page.route('**/rest/v1/rpc/get_event_setup', (route) =>
      route.fulfill({
        headers,
        json: {
          event: { id: eventId, name_en: 'Photos', code: 'PHOTO' },
          teams: [],
          games: [],
          rounds: [],
        },
      }),
    );
    let uploaded: Buffer | undefined;
    await page.route('**/storage/v1/object/game-images/**', (route) => {
      if (route.request().method() === 'OPTIONS') return route.fulfill({ headers, status: 204 });
      uploaded = route.request().postDataBuffer()!;
      return route.fulfill({ headers, json: { Key: 'image.webp' } });
    });
    await page.goto(`/manage/${eventId}/setup`);
    await page.getByRole('button', { name: labels.manage.tab.games, exact: true }).click();
    const input = page.locator('input[type=file]');
    const photo = page.getByRole('img', { name: labels.manage.gameImage, exact: true });
    for (const [format, width, height, expectedWidth, expectedHeight] of [
      ['png', 2048, 1024, 1024, 512],
      ['jpeg', 600, 1800, 341, 1024],
      ['webp', 240, 120, 240, 120],
    ] as const) {
      const buffer = await sharp({ create: { width, height, channels: 4, background: '#087f8c' } })
        .toFormat(format)
        .toBuffer();
      await input.setInputFiles({ name: `photo.${format}`, mimeType: `image/${format}`, buffer });
      await expect(photo).toBeVisible();
      await expect
        .poll(() =>
          photo.evaluate((img: HTMLImageElement) => [img.naturalWidth, img.naturalHeight]),
        )
        .toEqual([expectedWidth, expectedHeight]);
      await expect(page.getByText(`photo.webp`, { exact: false })).toBeVisible();
    }
    await page.locator('[formControlName=code]').fill('G01');
    await page.locator('[formControlName=name_en]').fill('Photo game');
    await page.getByRole('button', { name: labels.common.save, exact: true }).click();
    await expect.poll(() => !!uploaded).toBe(true);
    const start = uploaded!.indexOf('RIFF');
    expect(start).toBeGreaterThanOrEqual(0);
    const bytes = uploaded!.subarray(start, start + 8 + uploaded!.readUInt32LE(start + 4));
    expect(await sharp(bytes).metadata()).toMatchObject({
      format: 'webp',
      width: 240,
      height: 120,
    });
    // Wait for mutation/reload/reset, not merely the earlier storage request.
    await expect(page.locator('[formControlName=code]')).toHaveValue('');
    await expect(input).toBeEnabled();
    await input.setInputFiles({
      name: 'broken.png',
      mimeType: 'image/png',
      buffer: Buffer.from('not an image'),
    });
    await expect(page.getByText(labels.manage.invalidImage)).toBeVisible();
    await expect(photo).toHaveCount(0);
  });
}
