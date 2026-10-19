import { expect, test, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { readFileSync } from 'node:fs';
import { mockLiveEvent } from './live-fixtures';
import { mockOwner } from './owner-fixtures';
import { mockPublicEvent } from './public-fixtures';
import type {
  AppointmentDetail,
  AppointmentEntry,
} from '../src/app/features/appointments/appointment-types';

test.use({ serviceWorkers: 'block' });
const headers = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': '*',
  'access-control-allow-methods': '*',
};
async function fixture(page: Page, lang: 'en' | 'ar', owner = false) {
  if (owner) await mockOwner(page, lang);
  else await mockLiveEvent(page, { lang });
  const start = Date.now() + 86400000;
  const detail: AppointmentDetail = {
    session: {
      id: 'session-a',
      title: 'DST appointments',
      description: 'Member conversations',
      location: 'Meeting room',
      meeting_url: '',
      timezone: 'Africa/Cairo',
      event_id: null,
      status: 'PUBLISHED',
      opens_at: new Date(Date.now() - 3600000).toISOString(),
      closes_at: new Date(start - 3600000).toISOString(),
      cutoff_minutes: 60,
      version: 1,
    },
    slots: [0, 1].map((i) => ({
      id: `slot-${i}`,
      session_id: 'session-a',
      interviewer_id: 'interviewer-a',
      interviewer_name: 'Mina Interviewer',
      starts_at: new Date(start + i * 1800000).toISOString(),
      ends_at: new Date(start + i * 1800000 + 1200000).toISOString(),
      blocked: false,
      available: true,
      version: 1,
      booking: null,
    })),
  };
  const receipts = new Map<string, unknown>();
  const calls: { action: string; payload: any; opId: string }[] = [];
  const entries: AppointmentEntry[] = [];
  let lostResponse = false,
    failMove = false,
    rejectedRead = false;
  function entry() {
    const slot = detail.slots.find((s) => s.booking)!;
    if (!slot) return;
    entries.splice(0, entries.length, {
      ...slot.booking!,
      session_id: detail.session.id,
      slot_id: slot.id,
      title: detail.session.title,
      starts_at: slot.starts_at,
      ends_at: slot.ends_at,
      timezone: 'Africa/Cairo',
      location: 'Meeting room',
      meeting_url: '',
      interviewer_name: slot.interviewer_name,
      cutoff_minutes: 60,
      session_status: detail.session.status,
    });
  }
  await page.route('**/rest/v1/rpc/**', async (route) => {
    const name = new URL(route.request().url()).pathname.split('/').at(-1)!;
    if (
      ![
        'get_current_event',
        'get_my_profile',
        'list_appointment_sessions',
        'get_appointment_session',
        'get_my_appointments',
        'get_appointment_options',
        'get_appointment_operation',
        'appointment_write',
      ].includes(name)
    )
      return route.fallback();
    if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers });
    if (name === 'get_my_profile' && owner) return route.fallback();
    const args = route.request().postDataJSON();
    let data: unknown = null;
    if (name === 'get_my_profile')
      data = {
        id: 'member-a',
        username: 'member',
        full_name_en: 'Member Name',
        full_name_ar: 'Member Name',
        phone: null,
        system_role: 'MEMBER',
        roles: [],
        assigned_games: [],
      };
    if (name === 'list_appointment_sessions')
      data = [
        {
          ...detail.session,
          available: detail.slots.filter((s) => s.available).length,
          interviewer: true,
        },
      ];
    if (name === 'get_appointment_session') {
      if (rejectedRead)
        return route.fulfill({
          status: 400,
          headers,
          json: { code: 'P0001', message: 'FORBIDDEN' },
        });
      data = detail;
    }
    if (name === 'get_my_appointments') data = entries;
    if (name === 'get_appointment_options')
      data = { members: [{ id: 'interviewer-a', name: 'Mina Interviewer' }], events: [] };
    if (name === 'get_appointment_operation') data = receipts.get(args.p_op_id) ?? null;
    if (name === 'appointment_write') {
      const action = args.p_action,
        payload = args.p_payload;
      calls.push({ action, payload, opId: args.p_op_id });
      if (action === 'RESCHEDULE' && failMove)
        return route.fulfill({
          status: 400,
          headers,
          json: { code: 'P0001', message: 'SLOT_TAKEN' },
        });
      if (action === 'SAVE_SESSION') {
        Object.assign(detail.session, payload, {
          id: 'session-a',
          version: detail.session.version + 1,
        });
        data = { id: 'session-a', version: detail.session.version };
      }
      if (action === 'GENERATE_SLOTS' || action === 'SAVE_SLOT')
        data = { id: 'session-a', count: 2 };
      if (action === 'BOOK') {
        const slot = detail.slots.find((s) => s.id === payload.slot_id)!;
        slot.available = false;
        slot.booking = {
          id: 'booking-a',
          member_id: 'member-a',
          display_name: payload.display_name,
          status: 'BOOKED',
          version: 1,
        };
        entry();
        data = { id: 'booking-a', version: 1, status: 'BOOKED', slot_id: slot.id };
      }
      if (action === 'RESCHEDULE') {
        const old = detail.slots.find((s) => s.booking)!;
        const next = detail.slots.find((s) => s.id === payload.slot_id)!;
        next.booking = { ...old.booking!, version: old.booking!.version + 1 };
        next.available = false;
        old.booking = null;
        old.available = true;
        entry();
        data = { id: 'booking-a', version: 2, status: 'BOOKED', slot_id: next.id };
      }
      if (action === 'CANCEL' || action === 'ATTEND') {
        const status = action === 'CANCEL' ? 'CANCELLED' : payload.status;
        for (const e of entries) {
          e.status = status;
          e.version++;
        }
        for (const slot of detail.slots)
          if (slot.booking) {
            if (action === 'CANCEL') {
              slot.booking = null;
              slot.available = true;
            } else {
              slot.booking.status = status;
              slot.booking.version++;
            }
          }
        data = { id: 'booking-a', version: 2, status };
      }
      receipts.set(args.p_op_id, data);
      if (lostResponse) {
        lostResponse = false;
        return route.abort('failed');
      }
    }
    return route.fulfill({ headers, json: data });
  });
  return {
    detail,
    entries,
    calls,
    loseResponse: () => (lostResponse = true),
    failMove: () => (failMove = true),
    rejectRead: () => (rejectedRead = true),
  };
}

for (const lang of ['en', 'ar'] as const) {
  const catalog = JSON.parse(readFileSync(`public/i18n/${lang}.json`, 'utf8'));
  const t = catalog.appointments;
  test(`member books, atomically reschedules and cancels without a sports event in ${lang}`, async ({
    page,
  }) => {
    test.setTimeout(60000);
    const state = await fixture(page, lang);
    await page.goto('/appointments/session-a');
    await expect(page.getByLabel(t.yourName)).toHaveValue('Member Name');
    await expect(page.getByTestId('appointment-slot')).toHaveCount(2);
    await page.getByRole('button', { name: t.book, exact: true }).first().click();
    await expect(page.getByRole('dialog')).toContainText('Mina Interviewer');
    expect(state.calls).toHaveLength(0);
    await page.getByRole('dialog').getByRole('button', { name: t.confirm, exact: true }).click();
    await expect(page.getByTestId('toast')).toHaveText(t.confirmed);
    await expect(page.getByTestId('toast')).toHaveCount(0, { timeout: 10000 });
    await page
      .getByRole('button', { name: t.moveHere, exact: true })
      .evaluate((element) => element.scrollIntoView({ block: 'center' }));
    await page.getByRole('button', { name: t.moveHere, exact: true }).click();
    await page.getByRole('dialog').getByRole('button', { name: t.confirm, exact: true }).click();
    await expect.poll(() => state.calls.filter((c) => c.action === 'RESCHEDULE').length).toBe(1);
    expect(state.detail.slots[0].booking).toBeNull();
    expect(state.detail.slots[1].booking?.id).toBe('booking-a');
    await page.goto('/appointments/my-bookings');
    await expect(page.getByTestId('appointment-entry')).toContainText('Member Name');
    await page.getByRole('button', { name: t.cancelBooking, exact: true }).click();
    await page
      .getByRole('dialog')
      .getByRole('button', { name: t.cancelBooking, exact: true })
      .click();
    await expect(page.getByTestId('appointment-entry')).toContainText(t.status.CANCELLED);
    expect(state.calls.map((c) => c.action)).toEqual(['BOOK', 'RESCHEDULE', 'CANCEL']);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
  });
  test(`owner reviews generation before publishing in ${lang}`, async ({ page }) => {
    test.setTimeout(60000);
    const state = await fixture(page, lang, true);
    state.detail.session.status = 'DRAFT';
    await page.goto('/owner/appointments/session-a');
    const form = page.locator('#appointment-slot-editor');
    await form.getByLabel(t.interviewer, { exact: true }).selectOption('interviewer-a');
    await form.getByLabel(t.start, { exact: true }).fill('2027-02-20T18:00');
    await form.getByLabel(t.end, { exact: true }).fill('2027-02-20T19:00');
    await form.getByLabel(t.gap, { exact: true }).fill('10');
    await form.getByRole('button', { name: t.previewSlots, exact: true }).click();
    await expect(page.getByRole('dialog').locator('li')).toHaveCount(2);
    expect(state.calls).toHaveLength(0);
    expect((await new AxeBuilder({ page }).include('dialog').analyze()).violations).toEqual([]);
    await page.screenshot({
      path: `artifacts/appointments-owner-preview-${lang}.png`,
      fullPage: true,
    });
    await page.getByRole('dialog').getByRole('button', { name: t.confirm, exact: true }).click();
    await expect.poll(() => state.calls.length).toBe(1);
    expect(state.calls[0].payload.starts_at).toBe('2027-02-20T16:00:00.000Z');
    const settings = page.getByTestId('appointment-session-form');
    await settings
      .getByRole('combobox', { name: t.statusLabel, exact: true })
      .selectOption('PUBLISHED');
    await settings.getByRole('button', { name: t.reviewSave, exact: true }).click();
    await page.getByRole('dialog').getByRole('button', { name: t.confirm, exact: true }).click();
    await expect.poll(() => state.detail.session.status).toBe('PUBLISHED');
  });
  test(`lost confirmation reconciles one reservation in ${lang}`, async ({ page }) => {
    const state = await fixture(page, lang);
    state.loseResponse();
    await page.goto('/appointments/session-a');
    await page.getByRole('button', { name: t.book, exact: true }).first().click();
    await page.getByRole('dialog').getByRole('button', { name: t.confirm, exact: true }).click();
    await expect(page.getByRole('button', { name: t.checkRetry, exact: true })).toBeVisible();
    await expect(page.getByTestId('toast')).toHaveCount(0);
    await page.getByRole('button', { name: t.checkRetry, exact: true }).click();
    await expect(page.getByTestId('toast')).toHaveText(t.confirmed);
    expect(state.calls).toHaveLength(1);
    await expect(page.getByText('Member Name', { exact: true }).last()).toBeVisible();
  });
  test(`interviewer records assigned attendance in ${lang}`, async ({ page }) => {
    const state = await fixture(page, lang);
    state.entries.push({
      id: 'booking-a',
      member_id: 'attendee',
      display_name: 'Private attendee',
      version: 1,
      status: 'BOOKED',
      session_id: 'session-a',
      slot_id: 'slot-0',
      title: 'DST appointments',
      starts_at: new Date(Date.now() - 1800000).toISOString(),
      ends_at: new Date(Date.now() - 600000).toISOString(),
      timezone: 'Africa/Cairo',
      location: 'Room',
      meeting_url: '',
      interviewer_name: 'Member Name',
      cutoff_minutes: 60,
      session_status: 'PUBLISHED',
    });
    await page.goto('/interviews');
    await expect(page.getByTestId('appointment-entry')).toContainText('Private attendee');
    await page.getByRole('button', { name: t.completed, exact: true }).click();
    await expect(page.getByTestId('appointment-entry')).toContainText(t.status.COMPLETED);
    await expect(page.getByRole('button', { name: t.completed, exact: true })).toHaveCount(0);
    await page.screenshot({
      path: `artifacts/appointments-interviewer-${lang}.png`,
      fullPage: true,
    });
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  });
}

test('failed rescheduling preserves the original booking and reports the conflict', async ({
  page,
}) => {
  const t = JSON.parse(readFileSync('public/i18n/en.json', 'utf8')).appointments;
  const state = await fixture(page, 'en');
  state.detail.slots[0].booking = {
    id: 'booking-a',
    member_id: 'member-a',
    display_name: 'Member Name',
    version: 1,
    status: 'BOOKED',
  };
  state.detail.slots[0].available = false;
  state.failMove();
  await page.goto('/appointments/session-a');
  await page.getByRole('button', { name: t.moveHere, exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: t.confirm, exact: true }).click();
  await expect(page.getByRole('alert')).toHaveText(t.errors.SLOT_TAKEN);
  expect(state.detail.slots[0].booking?.id).toBe('booking-a');
  await expect(page.getByTestId('toast')).toHaveCount(0);
});
test('private session names disappear after authorization is revoked', async ({ page }) => {
  const t = JSON.parse(readFileSync('public/i18n/en.json', 'utf8')).appointments;
  const state = await fixture(page, 'en');
  state.detail.slots[0].booking = {
    id: 'booking-a',
    member_id: 'attendee',
    display_name: 'Private attendee',
    version: 1,
    status: 'BOOKED',
  };
  await page.goto('/appointments/session-a');
  await expect(page.getByText('Private attendee', { exact: true })).toBeVisible();
  state.rejectRead();
  await page.getByRole('button', { name: t.refresh, exact: true }).click();
  await expect(page.getByRole('alert')).toHaveText(t.errors.FORBIDDEN);
  await expect(page.getByText('Private attendee', { exact: true })).toHaveCount(0);
});
test('anonymous appointment deep links require login', async ({ page }) => {
  await mockPublicEvent(page, { noEvent: true });
  await page.goto('/appointments/session-a');
  await expect(page).toHaveURL(/\/login\?returnUrl=/);
  await expect(page.locator('input[type="password"]')).toBeVisible();
  await expect(page.getByTestId('appointment-slot')).toHaveCount(0);
});
