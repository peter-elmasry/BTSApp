import { expect, test } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { readFileSync } from 'node:fs';
import { mockPublicEvent } from './public-fixtures';

for (const lang of ['en', 'ar']) {
  test(`device notification controls retain consent and failure feedback in ${lang}`, async ({
    page,
    context,
  }) => {
    await mockPublicEvent(context);
    await page.addInitScript((lang) => {
      localStorage.setItem('bts.lang', lang);
      let permission: NotificationPermission = 'default';
      Object.defineProperty(Notification, 'permission', {
        configurable: true,
        get: () => permission,
      });
      Notification.requestPermission = async () => {
        permission = 'granted';
        return permission;
      };
      let current: PushSubscription | null = null;
      // Browser push-provider calls are fixture transports, not a claim of real phone delivery.
      const fixture = {
        endpoint: 'https://fcm.googleapis.com/fixture',
        expirationTime: null,
        options: {},
        toJSON: () => ({
          endpoint: 'https://fcm.googleapis.com/fixture',
          keys: { p256dh: 'B'.repeat(87), auth: 'A'.repeat(22) },
        }),
        unsubscribe: async () => {
          current = null;
          return true;
        },
        getKey: () => null,
      } as unknown as PushSubscription;
      PushManager.prototype.getSubscription = async () => current;
      PushManager.prototype.subscribe = async () => {
        current = fixture;
        return fixture;
      };
    }, lang);
    const labels = JSON.parse(readFileSync(`public/i18n/${lang}.json`, 'utf8')).push;
    const calls: string[] = [];
    let rejectSave = true;
    await context.route('**/functions/v1/round-push', async (route) => {
      const headers = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*' };
      if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers });
      const body = route.request().postDataJSON();
      calls.push(body.action);
      return route.fulfill({
        status: body.action === 'subscribe' && rejectSave ? 503 : 200,
        headers,
        json:
          body.action === 'config'
            ? { publicKey: 'B'.repeat(87) }
            : body.action === 'subscribe' && rejectSave
              ? { error: 'PUSH_UNAVAILABLE' }
              : { ok: true },
      });
    });
    await page.goto('/home');
    const controls = page.getByTestId('round-push-controls');
    await controls.locator('summary').click();
    await expect(controls.getByText(labels.phoneHelp)).toBeVisible();
    await expect(controls.getByRole('button', { name: labels.enable, exact: true })).toBeEnabled();
    expect(calls).toEqual(['config']);
    await page.evaluate(() => navigator.serviceWorker.ready);
    await controls.getByRole('button', { name: labels.enable, exact: true }).click();
    await expect(controls.getByRole('alert')).toHaveText(labels.saveFailed);
    await expect(controls.getByText(labels.saved, { exact: true })).toHaveCount(0);
    rejectSave = false;
    await controls.getByRole('button', { name: labels.enable, exact: true }).click();
    await expect(controls.getByText(labels.saved, { exact: true })).toBeVisible();
    await controls.getByRole('button', { name: labels.test, exact: true }).click();
    await expect(controls.getByText(labels.testQueued)).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    expect(
      (await new AxeBuilder({ page }).include('[data-testid="round-push-controls"]').analyze())
        .violations,
    ).toEqual([]);
    await page.screenshot({ path: `artifacts/round-push-${lang}.png`, fullPage: true });
    await controls.getByRole('button', { name: labels.disable, exact: true }).click();
    await expect(controls.getByText(labels.disabled, { exact: true })).toBeVisible();
    expect(calls).toContain('unsubscribe');
    expect(await page.evaluate(() => localStorage.getItem('bts.round-push'))).toBeNull();
  });
}

test('unconfigured server offers an explicit retry and never requests notification permission', async ({
  page,
  context,
}) => {
  await mockPublicEvent(context);
  await page.addInitScript(() => {
    localStorage.setItem('bts.lang', 'en');
    Notification.requestPermission = async () => {
      throw new Error('Unexpected permission prompt');
    };
  });
  await context.route('**/functions/v1/round-push', (route) =>
    route.fulfill({
      status: 503,
      headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*' },
      json: { error: 'NOT_CONFIGURED' },
    }),
  );
  await page.goto('/home');
  const controls = page.getByTestId('round-push-controls');
  await controls.locator('summary').click();
  await expect(controls.getByRole('alert')).toContainText('not configured');
  await expect(
    controls.getByRole('button', { name: 'Enable notifications', exact: true }),
  ).toBeDisabled();
  await expect(controls.getByRole('button', { name: 'Retry setup', exact: true })).toBeEnabled();
});
