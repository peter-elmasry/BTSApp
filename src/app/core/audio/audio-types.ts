export const AUDIO_CUES = [
  'round-start',
  'round-end',
  'match-win',
  'match-loss',
  'match-draw',
] as const;
export type AudioCue = (typeof AUDIO_CUES)[number];
export interface AudioConfig {
  enabled: boolean;
  round_start: boolean;
  round_end: boolean;
  match_win: boolean;
  match_loss: boolean;
  match_draw: boolean;
}
export const DEFAULT_AUDIO_CONFIG: AudioConfig = {
  enabled: true,
  round_start: true,
  round_end: true,
  match_win: true,
  match_loss: true,
  match_draw: true,
};
export const cueEnabled = (config: AudioConfig, cue: AudioCue) =>
  config.enabled && config[cue.replaceAll('-', '_') as Exclude<keyof AudioConfig, 'enabled'>];
export interface RoundAudioCue {
  cueId: string;
  roundId: string;
  cue: 'round-start' | 'round-end';
  occurredAt: string;
}
export interface TeamAudioResult {
  matchId: string;
  roundId: string;
  outcome: 'PENDING' | 'WIN' | 'LOSS' | 'FORFEIT' | 'DRAW';
  occurredAt: string | null;
  audible?: boolean;
}
export interface RoundAudioResponse {
  serverNow: string;
  config: AudioConfig;
  cues: RoundAudioCue[];
}
export interface TeamAudioResponse {
  serverNow: string;
  config: AudioConfig;
  results: TeamAudioResult[];
}
export const freshAudio = (occurredAt: string | null, now: number) => {
  const age = now - (occurredAt ? Date.parse(occurredAt) : NaN);
  return Number.isFinite(age) && age >= 0 && age <= 10_000;
};
export function outcomeCue(outcome: TeamAudioResult['outcome']): AudioCue | null {
  return outcome === 'WIN'
    ? 'match-win'
    : outcome === 'DRAW'
      ? 'match-draw'
      : outcome === 'LOSS' || outcome === 'FORFEIT'
        ? 'match-loss'
        : null;
}

/** Initial snapshots are silent; corrections cue only when the confirmed outcome changes. */
export class ResultAudioTracker {
  private previous: Map<string, string> | null = null;
  reset() {
    this.previous = null;
  }
  consume(results: TeamAudioResult[], now: number): TeamAudioResult[] {
    const next = new Map(results.map((result) => [result.matchId, result.outcome]));
    const changed = this.previous
      ? results.filter(
          (result) =>
            this.previous!.get(result.matchId) !== result.outcome &&
            !!outcomeCue(result.outcome) &&
            result.audible !== false &&
            freshAudio(result.occurredAt, now),
        )
      : [];
    this.previous = next;
    return changed;
  }
}
