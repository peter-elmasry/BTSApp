import { DOCUMENT } from '@angular/common';
import { computed, DestroyRef, effect, inject, Injectable, signal, untracked } from '@angular/core';
import { AuthStore } from '../auth/auth.store';
import { RpcTransport } from '../offline/rpc-transport';
import { ReadCacheService } from '../offline/read-cache.service';
import { EventStore } from '../player/event.store';
import { TeamSelectionStore } from '../player/team-selection.store';
import { EventChannelService } from '../realtime/event-channel.service';
import { AudioLeader } from './audio-leader';
import { BufferedAudio } from './buffered-audio';
import {
  DEFAULT_AUDIO_CONFIG,
  ResultAudioTracker,
  cueEnabled,
  freshAudio,
  outcomeCue,
  type AudioCue,
  type AudioConfig,
  type RoundAudioResponse,
  type TeamAudioResponse,
} from './audio-types';

const PREFERENCE = 'bts.audio.preference.v1';
const VOLUME = 'bts.audio.volume.v1';
function read(key: string) {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}
function write(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* Device storage is optional. */
  }
}

@Injectable({ providedIn: 'root' })
export class EventAudioService {
  private readonly document = inject(DOCUMENT);
  private readonly events = inject(EventStore);
  private readonly selection = inject(TeamSelectionStore);
  private readonly auth = inject(AuthStore);
  private readonly transport = inject(RpcTransport);
  private readonly cache = inject(ReadCacheService);
  private readonly channel = inject(EventChannelService);
  readonly config = computed(() => this.events.event()?.audio_config ?? DEFAULT_AUDIO_CONFIG);
  readonly decision = signal(read(PREFERENCE));
  readonly enabled = signal(false);
  readonly running = signal(false);
  readonly loading = signal(false);
  readonly missing = signal<AudioCue[]>([]);
  readonly failed = signal(false);
  readonly leader = signal(false);
  readonly roundOnly = signal(false);
  readonly foreground = signal(this.document.visibilityState !== 'hidden');
  readonly volume = signal(
    Number.isFinite(Number(read(VOLUME))) && read(VOLUME) !== null
      ? Math.min(100, Math.max(0, Number(read(VOLUME))))
      : 70,
  );
  readonly prompt = computed(() => this.config().enabled && !this.decision());
  readonly needsGesture = computed(() => this.enabled() && !this.running());
  private readonly audio = new BufferedAudio((running) => this.running.set(running));
  private readonly ownership = new AudioLeader((leader) => this.leader.set(leader));
  private readonly results = new ResultAudioTracker();
  private generation = 0;
  private activation = 0;
  private context = '';
  private eventId: string | null = null;
  private teamCode: string | null = null;
  private roundBaseline = false;
  private readonly roundSeen = new Set<string>();
  private roundFlight = false;
  private resultFlight = false;
  private roundAgain = false;
  private resultAgain = false;
  private roundFailed = false;
  private resultFailed = false;
  private readonly pendingCues = new Map<string, () => boolean>();
  private readonly queuedCues = new Set<string>();
  constructor() {
    const destroy = inject(DestroyRef);
    effect(() => {
      const event = this.events.event()?.id;
      const enabled =
        this.enabled() && this.running() && this.foreground() && this.config().enabled;
      untracked(() => (enabled && event ? this.ownership.start(event) : this.ownership.stop()));
    });
    effect(() => {
      const event = this.events.event()?.id ?? null;
      const team =
        this.roundOnly() || this.selection.staffWithoutTeam()
          ? null
          : this.selection.selectedCode();
      const profile = this.auth.profile();
      const context = JSON.stringify([
        event,
        team,
        this.auth.session()?.user.id,
        profile?.system_role,
        profile?.roles,
        this.enabled(),
        this.running(),
        this.leader(),
        this.foreground(),
        this.config(),
      ]);
      if (context === this.context) return;
      this.context = context;
      const listening =
        this.enabled() &&
        this.running() &&
        this.leader() &&
        this.foreground() &&
        this.config().enabled;
      untracked(() => this.reset(listening ? event : null, team));
    });
    const subscription = this.channel.immediate.subscribe((message) => {
      if (message.eventId !== this.eventId || !this.canListen()) return;
      if (message.event === 'round_audio' || message.event === 'round_changed')
        void this.readRounds();
      else if (message.event === 'match_changed') void this.readResults();
    });
    // Successful local writes invalidate the read cache, even without a broadcast.
    effect(() => {
      this.cache.updates();
      untracked(() => {
        void this.readRounds();
        void this.readResults();
      });
    });
    const poll = setInterval(() => {
      if (this.eventId && this.canListen()) {
        // A subscribed socket can silently miss a database broadcast. Verify fresh
        // occurrences independently; IDs/server timestamps still prevent replays.
        void this.readRounds();
        void this.readResults();
        this.retryCues();
      }
    }, 2000);
    const visibility = () => this.foreground.set(this.document.visibilityState !== 'hidden');
    const online = () => {
      this.reset(this.eventId, this.teamCode);
    };
    const storage = (event: StorageEvent) => {
      if (event.key === null) {
        this.decision.set(null);
        this.mute(false);
        return;
      }
      if (event.key === PREFERENCE) {
        this.decision.set(read(PREFERENCE));
        if (read(PREFERENCE) !== 'enabled') this.mute(false);
      }
      if (event.key === VOLUME) this.setVolume(Number(read(VOLUME) ?? 70), false);
    };
    this.document.addEventListener('visibilitychange', visibility);
    this.document.defaultView?.addEventListener('online', online);
    this.document.defaultView?.addEventListener('storage', storage);
    destroy.onDestroy(() => {
      this.generation++;
      this.activation++;
      this.ownership.stop();
      this.audio.destroy();
      subscription.unsubscribe();
      clearInterval(poll);
      this.document.removeEventListener('visibilitychange', visibility);
      this.document.defaultView?.removeEventListener('online', online);
      this.document.defaultView?.removeEventListener('storage', storage);
    });
  }
  async enable() {
    const activation = ++this.activation;
    this.decision.set('enabled');
    write(PREFERENCE, 'enabled');
    this.enabled.set(true);
    this.loading.set(true);
    this.failed.set(false);
    this.audio.setVolume(this.volume() / 100);
    try {
      const missing = await this.audio.enable();
      if (activation === this.activation) this.missing.set(missing);
    } catch {
      if (activation === this.activation) {
        this.enabled.set(false);
        this.failed.set(true);
      }
    } finally {
      if (activation === this.activation) this.loading.set(false);
    }
  }
  mute(persist = true) {
    this.activation++;
    this.enabled.set(false);
    this.loading.set(false);
    this.failed.set(false);
    this.audio.mute();
    this.ownership.stop();
    if (persist) {
      this.decision.set('muted');
      write(PREFERENCE, 'muted');
    }
    this.reset(null, null);
  }
  setVolume(value: number, persist = true) {
    if (!Number.isFinite(value)) return;
    value = Math.max(0, Math.min(100, value));
    this.volume.set(value);
    this.audio.setVolume(value / 100);
    if (persist) write(VOLUME, String(value));
  }
  preview(cue: AudioCue) {
    if (this.canListen()) this.audio.enqueue(cue, () => this.canListen());
  }
  async testSound() {
    // Explicit local test also diagnoses speaker/activation issues when an
    // organizer has disabled event announcements. It never marks an event heard.
    await this.enable();
    this.audio.enqueue('round-start', () => this.enabled() && this.running() && this.foreground());
  }
  private canListen() {
    return (
      this.enabled() &&
      this.running() &&
      this.leader() &&
      this.foreground() &&
      this.config().enabled &&
      this.ownership.owns(this.events.event()?.id ?? '')
    );
  }
  private reset(eventId: string | null, teamCode: string | null) {
    this.generation++;
    this.audio.clear();
    this.pendingCues.clear();
    this.queuedCues.clear();
    this.eventId = eventId;
    this.teamCode = teamCode;
    this.roundBaseline = false;
    this.roundSeen.clear();
    this.results.reset();
    this.roundFlight = false;
    this.resultFlight = false;
    this.roundAgain = false;
    this.resultAgain = false;
    this.roundFailed = false;
    this.resultFailed = false;
    if (eventId && this.canListen()) {
      void this.readRounds();
      void this.readResults();
    }
  }
  private async readRounds() {
    if (!this.eventId || !this.canListen()) return;
    if (this.roundFlight) {
      this.roundAgain = true;
      return;
    }
    this.roundFlight = true;
    const generation = this.generation;
    const event = this.eventId;
    try {
      const response = await this.transport.rpc<RoundAudioResponse>('get_recent_round_cues', {
        p_event: event,
      });
      if (generation !== this.generation) return;
      const received = performance.now();
      const now = Date.parse(response.serverNow);
      for (const cue of response.cues ?? []) {
        const seen = this.roundSeen.has(cue.cueId);
        this.roundSeen.add(cue.cueId);
        if (this.roundSeen.size > 200) this.roundSeen.delete(this.roundSeen.values().next().value!);
        if (this.roundBaseline && !seen && freshAudio(cue.occurredAt, now))
          this.play(
            `${event}:round:${cue.cueId}`,
            cue.cue,
            cue.occurredAt,
            now,
            received,
            response.config,
            generation,
          );
      }
      this.roundBaseline = true;
      this.roundFailed = false;
      this.failed.set(this.resultFailed);
    } catch {
      if (generation === this.generation) {
        this.roundFailed = true;
        this.failed.set(true);
      }
    } finally {
      if (generation === this.generation) {
        this.roundFlight = false;
        if (this.roundAgain) {
          this.roundAgain = false;
          void this.readRounds();
        }
      }
    }
  }
  private async readResults() {
    if (!this.eventId || !this.teamCode || !this.canListen()) return;
    if (this.resultFlight) {
      this.resultAgain = true;
      return;
    }
    this.resultFlight = true;
    const generation = this.generation;
    const event = this.eventId;
    const team = this.teamCode;
    try {
      const response = await this.transport.rpc<TeamAudioResponse>('get_team_audio_results', {
        p_event: event,
        p_team_code: team,
      });
      if (generation !== this.generation) return;
      const received = performance.now();
      const now = Date.parse(response.serverNow);
      for (const result of this.results.consume(response.results ?? [], now)) {
        const cue = outcomeCue(result.outcome);
        if (cue && result.occurredAt)
          this.play(
            `${event}:${team}:${result.matchId}:${result.occurredAt}:${result.outcome}`,
            cue,
            result.occurredAt,
            now,
            received,
            response.config,
            generation,
          );
      }
      this.resultFailed = false;
      this.failed.set(this.roundFailed);
    } catch {
      if (generation === this.generation) {
        this.resultFailed = true;
        this.failed.set(true);
      }
    } finally {
      if (generation === this.generation) {
        this.resultFlight = false;
        if (this.resultAgain) {
          this.resultAgain = false;
          void this.readResults();
        }
      }
    }
  }
  private play(
    id: string,
    cue: AudioCue,
    occurred: string,
    now: number,
    received: number,
    config: AudioConfig,
    generation: number,
  ) {
    if (!cueEnabled(config, cue) || this.heard(id) || this.pendingCues.has(id)) return;
    const allowed = () =>
      generation === this.generation &&
      this.canListen() &&
      cueEnabled(this.config(), cue) &&
      freshAudio(occurred, now + performance.now() - received);
    this.pendingCues.set(id, () => {
      if (!allowed() || this.heard(id)) return false;
      if (!this.queuedCues.has(id)) {
        this.queuedCues.add(id);
        const accepted = this.audio.enqueue(
          cue,
          allowed,
          () => {
            this.remember(id);
            this.pendingCues.delete(id);
            this.queuedCues.delete(id);
          },
          () => this.queuedCues.delete(id),
        );
        if (!accepted) this.queuedCues.delete(id);
      }
      return true;
    });
    this.retryCues();
  }
  private retryCues() {
    for (const [id, retry] of this.pendingCues) if (!retry()) this.pendingCues.delete(id);
  }
  private heard(id: string) {
    try {
      return (JSON.parse(read('bts.audio.heard.v1') || '[]') as unknown[]).includes(id);
    } catch {
      return false;
    }
  }
  private remember(id: string) {
    try {
      const previous = JSON.parse(read('bts.audio.heard.v1') || '[]');
      write(
        'bts.audio.heard.v1',
        JSON.stringify([...(Array.isArray(previous) ? previous : []).slice(-199), id]),
      );
    } catch {
      /* In-memory occurrence tracking remains available. */
    }
  }
}
