import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { mockAudio, starts } from './audio-fixtures';
import type { RoundAudioCue } from '../src/app/core/audio/audio-types';
test.use({ serviceWorkers: 'block' });
const roundId = '66000000-0000-0000-0000-000000000001';
for (const lang of ['en', 'ar'] as const) {
  test(`sound consent, fresh round cues and mute in ${lang}`, async ({ page }) => {
    const mock = await mockAudio(page, lang);
    const labels = JSON.parse(readFileSync(`public/i18n/${lang}.json`, 'utf8'));
    let assets = 0;
    page.on('request', (request) => {
      if (request.url().endsWith('.mp3')) assets++;
    });
    await page.goto('/choose-team');
    await expect(page.getByTestId('audio-consent')).toBeVisible();
    expect(assets).toBe(0);
    await page.getByRole('button', { name: labels.audio.keepMuted, exact: true }).click();
    await page.reload();
    await expect(page.getByTestId('team-card-T01')).toBeVisible();
    await expect(page.getByTestId('audio-consent')).toHaveCount(0);
    expect(assets).toBe(0);
    const history: RoundAudioCue = {
      cueId: crypto.randomUUID(),
      roundId,
      cue: 'round-start',
      occurredAt: new Date().toISOString(),
    };
    mock.backend.cues = [history];
    await page.getByRole('button', { name: labels.audio.enable, exact: true }).click();
    await expect(page.getByText(labels.audio.enabled, { exact: true })).toBeVisible();
    await expect.poll(() => mock.backend.roundReads).toBeGreaterThan(0);
    await expect.poll(() => assets).toBe(5);
    expect(await starts(page)).toHaveLength(0);
    const cue: RoundAudioCue = {
      cueId: crypto.randomUUID(),
      roundId,
      cue: 'round-start',
      occurredAt: new Date().toISOString(),
    };
    mock.backend.cues.push(cue);
    const emitted = Date.now();
    await mock.emit('round_audio', { type: 'round_audio', ...cue });
    await expect.poll(async () => await starts(page)).toHaveLength(1);
    const first = (await starts(page))[0];
    expect(first.clip).toContain('round-start.mp3');
    expect(first.duration).toBeGreaterThan(0);
    expect(first.at - emitted).toBeLessThan(1000);
    const before = mock.backend.roundReads;
    await mock.emit('round_audio', { type: 'round_audio', ...cue });
    await expect.poll(() => mock.backend.roundReads).toBeGreaterThan(before);
    expect(await starts(page)).toHaveLength(1);
    await expect
      .poll(() => page.evaluate(() => (window as any).__audioEnds), { timeout: 6000 })
      .toBe(1);
    const end: RoundAudioCue = {
      cueId: crypto.randomUUID(),
      roundId,
      cue: 'round-end',
      occurredAt: new Date().toISOString(),
    };
    const restart: RoundAudioCue = {
      cueId: crypto.randomUUID(),
      roundId,
      cue: 'round-start',
      occurredAt: new Date().toISOString(),
    };
    mock.backend.cues.push(end, restart);
    await mock.emit('round_audio', { type: 'round_audio', ...end });
    await mock.emit('round_audio', { type: 'round_audio', ...restart });
    await expect.poll(async () => (await starts(page)).length, { timeout: 7000 }).toBe(3);
    expect((await starts(page)).slice(1).map((item) => item.clip.split('/').at(-1))).toEqual([
      'round-end.mp3',
      'round-start.mp3',
    ]);
    await page.getByRole('button', { name: labels.audio.mute, exact: true }).click();
    const next = {
      ...cue,
      cueId: crypto.randomUUID(),
      cue: 'round-end' as const,
      occurredAt: new Date().toISOString(),
    };
    mock.backend.cues.push(next);
    await mock.emit('round_audio', { type: 'round_audio', ...next });
    await expect(page.getByText(labels.audio.muted, { exact: true })).toBeVisible();
    expect(await starts(page)).toHaveLength(3);
  });
  test(`only changed followed-team results sound in ${lang}`, async ({ page }) => {
    const mock = await mockAudio(page, lang, true);
    const labels = JSON.parse(readFileSync(`public/i18n/${lang}.json`, 'utf8'));
    const result = {
      matchId: 'm1',
      roundId,
      outcome: 'WIN' as const,
      occurredAt: new Date().toISOString(),
    };
    mock.backend.results = [result];
    await page.goto('/home');
    await page.getByRole('button', { name: labels.audio.enable, exact: true }).click();
    await expect(page.getByText(labels.audio.enabled, { exact: true })).toBeVisible();
    await expect.poll(() => mock.backend.resultReads).toBeGreaterThan(0);
    expect(await starts(page)).toHaveLength(0);
    for (const [outcome, clip] of [
      ['LOSS', 'match-loss'],
      ['DRAW', 'match-draw'],
      ['WIN', 'match-win'],
    ] as const) {
      mock.backend.results = [{ ...result, outcome, occurredAt: new Date().toISOString() }];
      const count = (await starts(page)).length;
      await mock.emit('match_changed', { type: 'match_changed', matchId: 'm1', roundId });
      try {
        await expect
          .poll(async () => (await starts(page)).length, { timeout: 7000 })
          .toBe(count + 1);
      } catch (error) {
        const diagnostic = await page.evaluate(() => ({
          heard: localStorage.getItem('bts.audio.heard.v1'),
          states: (window as any).__audioContexts.map((context: AudioContext) => ({
            state: context.state,
            time: context.currentTime,
          })),
          visible: document.visibilityState,
        }));
        throw new Error(
          JSON.stringify({
            outcome,
            diagnostic,
            roundReads: mock.backend.roundReads,
            resultReads: mock.backend.resultReads,
            error: String(error),
          }),
        );
      }
      expect((await starts(page)).at(-1)!.clip).toContain(`${clip}.mp3`);
      await expect
        .poll(() => page.evaluate(() => (window as any).__audioEnds), { timeout: 6000 })
        .toBe(count + 1);
    }
    const before = mock.backend.resultReads;
    mock.backend.results = [{ ...result, occurredAt: new Date().toISOString() }];
    await mock.emit('match_changed', { type: 'match_changed', matchId: 'm1', roundId });
    await expect.poll(() => mock.backend.resultReads).toBeGreaterThan(before);
    expect(await starts(page)).toHaveLength(3);
    mock.backend.results = [{ ...result, outcome: 'PENDING', occurredAt: null }];
    await mock.emit('match_changed', { type: 'match_changed', matchId: 'm1', roundId });
    await expect.poll(() => mock.backend.resultReads).toBeGreaterThan(before + 1);
    expect(await starts(page)).toHaveLength(3);
  });
}
test('autoplay rejection stays silent and offers activation again', async ({ page }) => {
  await mockAudio(page);
  await page.addInitScript(() => {
    AudioContext.prototype.resume = () => Promise.reject(new Error('blocked'));
  });
  const labels = JSON.parse(readFileSync('public/i18n/en.json', 'utf8'));
  await page.goto('/choose-team');
  await page.getByRole('button', { name: labels.audio.enable, exact: true }).click();
  await expect(page.getByText(labels.audio.unavailable, { exact: true })).toBeVisible();
  expect(await starts(page)).toHaveLength(0);
  await expect(page.getByRole('button', { name: labels.audio.enable, exact: true })).toBeEnabled();
});
test('polling sounds only a fresh occurrence when realtime is unavailable', async ({ page }) => {
  const mock = await mockAudio(page, 'en', false, false);
  const labels = JSON.parse(readFileSync('public/i18n/en.json', 'utf8'));
  await page.goto('/choose-team');
  await page.getByRole('button', { name: labels.audio.enable, exact: true }).click();
  await expect(page.getByText(labels.audio.enabled, { exact: true })).toBeVisible();
  await expect.poll(() => mock.backend.roundReads).toBeGreaterThan(0);
  mock.backend.cues.push(
    {
      cueId: crypto.randomUUID(),
      roundId,
      cue: 'round-end',
      occurredAt: new Date(Date.now() - 15000).toISOString(),
    },
    {
      cueId: crypto.randomUUID(),
      roundId,
      cue: 'round-start',
      occurredAt: new Date().toISOString(),
    },
  );
  await expect.poll(async () => (await starts(page)).length, { timeout: 7000 }).toBe(1);
  expect((await starts(page))[0].clip).toContain('round-start.mp3');
});
test('two enabled tabs produce one audible round cue', async ({ page, context }) => {
  const first = await mockAudio(page);
  const labels = JSON.parse(readFileSync('public/i18n/en.json', 'utf8'));
  await page.goto('/choose-team');
  await page.getByRole('button', { name: labels.audio.enable, exact: true }).click();
  await expect(page.getByText(labels.audio.enabled, { exact: true })).toBeVisible();
  const secondPage = await context.newPage();
  const second = await mockAudio(secondPage);
  await secondPage.goto('/choose-team');
  await secondPage.getByRole('button', { name: labels.audio.enable, exact: true }).click();
  await expect(secondPage.getByText(labels.audio.preparing, { exact: true })).toHaveCount(0);
  await expect(
    secondPage.getByRole('button', { name: labels.audio.mute, exact: true }),
  ).toBeVisible();
  const cue: RoundAudioCue = {
    cueId: crypto.randomUUID(),
    roundId,
    cue: 'round-start',
    occurredAt: new Date().toISOString(),
  };
  first.backend.cues = [cue];
  second.backend.cues = [cue];
  await first.emit('round_audio', { type: 'round_audio', ...cue });
  await second.emit('round_audio', { type: 'round_audio', ...cue });
  await expect
    .poll(async () => (await starts(page)).length + (await starts(secondPage)).length)
    .toBe(1);
  await secondPage.close();
});
test('venue display keeps followed-team results silent', async ({ page }) => {
  const mock = await mockAudio(page, 'en', true);
  const labels = JSON.parse(readFileSync('public/i18n/en.json', 'utf8'));
  await page.goto('/display');
  await page.getByRole('button', { name: labels.audio.enable, exact: true }).click();
  await expect(page.getByText(labels.audio.enabled, { exact: true })).toBeVisible();
  mock.backend.results = [
    { matchId: 'm1', roundId, outcome: 'WIN', occurredAt: new Date().toISOString() },
  ];
  await mock.emit('match_changed', { type: 'match_changed', matchId: 'm1', roundId });
  expect(mock.backend.resultReads).toBe(0);
  expect(await starts(page)).toHaveLength(0);
});
test('event master switch keeps the device silent without prompting', async ({ page }) => {
  const mock = await mockAudio(page);
  mock.backend.config.enabled = false;
  const labels = JSON.parse(readFileSync('public/i18n/en.json', 'utf8'));
  await page.goto('/choose-team');
  await expect(page.getByText(labels.audio.organizerMuted)).toBeVisible();
  await expect(page.getByTestId('audio-consent')).toHaveCount(0);
  expect(await starts(page)).toHaveLength(0);
});
