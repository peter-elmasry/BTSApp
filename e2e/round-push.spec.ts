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
      (window as any).__permissionRequests = 0;
      Object.defineProperty(Notification, 'permission', {
        configurable: true,
        get: () => permission,
      });
      Notification.requestPermission = async () => {
        (window as any).__permissionRequests++;
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
    const consent = page.getByTestId('push-consent');
    await expect(consent).toBeVisible();
    await expect(consent.getByText(labels.allowHelp)).toBeVisible();
    expect((await new AxeBuilder({ page }).include('dialog[open]').analyze()).violations).toEqual(
      [],
    );
    await page.screenshot({ path: `artifacts/push-consent-${lang}.png`, fullPage: true });
    await expect(consent.getByRole('button', { name: labels.enable, exact: true })).toBeEnabled();
    expect(calls).toEqual(['config']);
    expect(await page.evaluate(() => (window as any).__permissionRequests)).toBe(0);
    await page.evaluate(() => navigator.serviceWorker.ready);
    await consent.getByRole('button', { name: labels.enable, exact: true }).click();
    await expect(consent.getByRole('alert')).toHaveText(labels.saveFailed);
    await expect(consent).toBeVisible();
    rejectSave = false;
    await consent.getByRole('button', { name: labels.enable, exact: true }).click();
    await expect(consent).toHaveCount(0);
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

for (const mode of ['defer', 'denied', 'iphone'] as const) {
  test(`proactive notification guidance handles ${mode} without an automatic native request`, async ({
    page,
    context,
  }) => {
    await mockPublicEvent(context);
    await page.addInitScript((mode) => {
      localStorage.setItem('bts.lang', 'en');
      if (mode === 'defer' && !sessionStorage.getItem('push-first-visit')) {
        localStorage.removeItem('bts.audio.preference.v1');
        sessionStorage.setItem('push-first-visit', 'true');
      }
      Object.defineProperty(Notification, 'permission', {
        configurable: true,
        get: () => (mode === 'denied' ? 'denied' : 'default'),
      });
      Notification.requestPermission = async () => {
        throw new Error('Unexpected native permission request');
      };
      if (mode === 'iphone')
        Object.defineProperty(navigator, 'userAgent', { configurable: true, value: 'iPhone' });
    }, mode);
    await context.route('**/functions/v1/round-push', (route) =>
      route.fulfill({
        headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*' },
        json: { publicKey: 'B'.repeat(87) },
      }),
    );
    await page.goto('/home');
    const consent = page.getByTestId('push-consent');
    if (mode === 'defer') {
      await expect(page.getByTestId('audio-consent')).toBeVisible();
      await expect(consent).toHaveCount(0);
      await page.getByRole('button', { name: 'Keep muted', exact: true }).click();
    }
    await expect(consent).toBeVisible();
    if (mode === 'denied')
      await expect(consent.getByText(/Notifications are blocked/)).toBeVisible();
    if (mode === 'iphone')
      await expect(consent.getByText(/open this page in Safari/)).toBeVisible();
    if (mode !== 'defer')
      await expect(
        consent.getByRole('button', { name: 'Enable notifications', exact: true }),
      ).toHaveCount(0);
    await consent
      .getByRole('button', { name: mode === 'defer' ? 'Not now' : 'Continue', exact: true })
      .click();
    await page.reload();
    await expect(page.getByTestId('round-push-controls')).toBeVisible();
    await expect(consent).toHaveCount(0);
    if (mode === 'iphone') {
      await page.addInitScript(() =>
        Object.defineProperty(navigator, 'standalone', { configurable: true, value: true }),
      );
      await page.reload();
      await expect(consent).toBeVisible();
      await expect(
        consent.getByRole('button', { name: 'Enable notifications', exact: true }),
      ).toBeVisible();
    }
  });
}
