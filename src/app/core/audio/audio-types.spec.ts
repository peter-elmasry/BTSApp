import { describe, expect, it } from 'vitest';
import {
  DEFAULT_AUDIO_CONFIG,
  ResultAudioTracker,
  cueEnabled,
  freshAudio,
  outcomeCue,
  type TeamAudioResult,
} from './audio-types';
describe('fresh audio results', () => {
  const now = Date.parse('2026-10-15T10:00:00Z');
  const result = (outcome: TeamAudioResult['outcome'], age = 0) => ({
    matchId: 'm1',
    roundId: 'r1',
    outcome,
    occurredAt: new Date(now - age).toISOString(),
  });
  it('keeps the initial baseline, unchanged corrections and stale outcomes silent', () => {
    const tracker = new ResultAudioTracker();
    expect(tracker.consume([result('WIN')], now)).toEqual([]);
    expect(tracker.consume([result('WIN', -1)], now)).toEqual([]);
    expect(tracker.consume([result('LOSS', 10001)], now)).toEqual([]);
    tracker.reset();
    expect(tracker.consume([result('DRAW')], now)).toEqual([]);
  });
  it('sounds new and changed outcomes, with resets and voids remaining silent', () => {
    const tracker = new ResultAudioTracker();
    tracker.consume([result('PENDING')], now);
    expect(tracker.consume([result('DRAW')], now)).toHaveLength(1);
    expect(tracker.consume([result('LOSS')], now)).toHaveLength(1);
    expect(tracker.consume([result('PENDING')], now)).toEqual([]);
    expect(tracker.consume([result('WIN')], now)).toHaveLength(1);
    expect(outcomeCue('FORFEIT')).toBe('match-loss');
  });
  it('enforces freshness and both event switches', () => {
    expect(freshAudio(null, now)).toBe(false);
    expect(freshAudio(new Date(now + 1).toISOString(), now)).toBe(false);
    expect(freshAudio(new Date(now - 10000).toISOString(), now)).toBe(true);
    expect(cueEnabled({ ...DEFAULT_AUDIO_CONFIG, enabled: false }, 'match-win')).toBe(false);
    expect(cueEnabled({ ...DEFAULT_AUDIO_CONFIG, match_draw: false }, 'match-draw')).toBe(false);
    expect(cueEnabled(DEFAULT_AUDIO_CONFIG, 'round-start')).toBe(true);
  });
  it('never backlogs an outcome recorded while its cue was disabled', () => {
    const tracker = new ResultAudioTracker();
    tracker.consume([result('PENDING')], now);
    expect(tracker.consume([{ ...result('WIN'), audible: false }], now)).toEqual([]);
    expect(tracker.consume([{ ...result('WIN'), audible: true }], now)).toEqual([]);
  });
});
