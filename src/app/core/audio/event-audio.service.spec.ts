import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { Subject } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { EventAudioService } from './event-audio.service';
import { DEFAULT_AUDIO_CONFIG, type TeamAudioResult } from './audio-types';
import { EventStore } from '../player/event.store';
import { TeamSelectionStore } from '../player/team-selection.store';
import { AuthStore } from '../auth/auth.store';
import { RpcTransport } from '../offline/rpc-transport';
import { EventChannelService } from '../realtime/event-channel.service';

describe('audio activation and private response lifetime', () => {
  let service: EventAudioService;
  let starts: number;
  let constructors: number;
  let result: TeamAudioResult;
  let pending: Promise<unknown> | null;
  const selected = signal('T01');
  const profile = signal<unknown>(null);
  const immediate = new Subject<{ eventId: string; event: string; payload: unknown }>();
  const descriptor = Object.getOwnPropertyDescriptor(navigator, 'locks');
  const flush = async () => {
    for (let n = 0; n < 5; n++) {
      TestBed.tick();
      await Promise.resolve();
    }
  };
  beforeEach(() => {
    starts = 0;
    constructors = 0;
    pending = null;
    selected.set('T01');
    profile.set(null);
    localStorage.clear();
    vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible');
    Object.defineProperty(navigator, 'locks', {
      configurable: true,
      get: () => ({
        request: async (
          _name: string,
          _options: unknown,
          callback: (lock: object) => Promise<void>,
        ) => callback({}),
      }),
    });
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ ok: true, arrayBuffer: async () => new ArrayBuffer(1) })),
    );
    vi.stubGlobal(
      'AudioContext',
      class {
        state = 'suspended';
        destination = {};
        onstatechange = () => {};
        constructor() {
          constructors++;
        }
        resume() {
          this.state = 'running';
          return Promise.resolve();
        }
        suspend() {
          this.state = 'suspended';
          return Promise.resolve();
        }
        close() {
          return Promise.resolve();
        }
        createGain() {
          return { gain: { value: 1 }, connect: vi.fn() };
        }
        decodeAudioData() {
          return Promise.resolve({ duration: 1 });
        }
        createBufferSource() {
          return {
            buffer: null,
            onended: null,
            connect: vi.fn(),
            disconnect: vi.fn(),
            start: () => {
              starts++;
            },
            stop: vi.fn(),
          };
        }
      },
    );
    result = { matchId: 'm1', roundId: 'r1', outcome: 'PENDING', occurredAt: null };
    TestBed.configureTestingModule({
      providers: [
        {
          provide: EventStore,
          useValue: { event: signal({ id: 'e1', audio_config: { ...DEFAULT_AUDIO_CONFIG } }) },
        },
        {
          provide: TeamSelectionStore,
          useValue: { selectedCode: selected, staffWithoutTeam: signal(false) },
        },
        { provide: AuthStore, useValue: { session: signal(null), profile } },
        {
          provide: EventChannelService,
          useValue: { immediate: immediate.asObservable(), isSubscribed: () => true },
        },
        {
          provide: RpcTransport,
          useValue: {
            rpc: vi.fn((name: string, args: { p_team_code?: string }) => {
              if (name === 'get_recent_round_cues')
                return Promise.resolve({
                  serverNow: new Date().toISOString(),
                  config: DEFAULT_AUDIO_CONFIG,
                  cues: [],
                });
              if (pending && args.p_team_code === 'T01') {
                const response = pending;
                pending = null;
                return response;
              }
              return Promise.resolve({
                serverNow: new Date().toISOString(),
                config: DEFAULT_AUDIO_CONFIG,
                results: [result],
              });
            }),
          },
        },
      ],
    });
    service = TestBed.inject(EventAudioService);
  });
  afterEach(() => {
    TestBed.resetTestingModule();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    if (descriptor) Object.defineProperty(navigator, 'locks', descriptor);
    else Reflect.deleteProperty(navigator, 'locks');
    localStorage.clear();
  });
  it('stays silent before consent and on the initial result baseline', async () => {
    await flush();
    expect(constructors).toBe(0);
    expect(fetch).not.toHaveBeenCalled();
    result = { ...result, outcome: 'WIN', occurredAt: new Date().toISOString() };
    await service.enable();
    await flush();
    expect(service.leader()).toBe(true);
    expect(starts).toBe(0);
    result = { ...result, outcome: 'DRAW', occurredAt: new Date().toISOString() };
    immediate.next({ eventId: 'e1', event: 'match_changed', payload: {} });
    await flush();
    expect(starts).toBe(1);
    service.mute();
    immediate.next({ eventId: 'e1', event: 'match_changed', payload: {} });
    await flush();
    expect(starts).toBe(1);
    expect(service.enabled()).toBe(false);
  });
  it('discards an in-flight result when the followed team changes', async () => {
    await service.enable();
    await flush();
    let resolve!: (value: unknown) => void;
    pending = new Promise((done) => (resolve = done));
    immediate.next({ eventId: 'e1', event: 'match_changed', payload: {} });
    selected.set('T02');
    await flush();
    resolve({
      serverNow: new Date().toISOString(),
      config: DEFAULT_AUDIO_CONFIG,
      results: [{ ...result, outcome: 'LOSS', occurredAt: new Date().toISOString() }],
    });
    await flush();
    expect(starts).toBe(0);
    result = { ...result, outcome: 'WIN', occurredAt: new Date().toISOString() };
    immediate.next({ eventId: 'e1', event: 'match_changed', payload: {} });
    await flush();
    expect(starts).toBe(1);
  });
});
