import { expect, type Page, type WebSocketRoute } from '@playwright/test';
import { event, eventId, mockPublicEvent } from './public-fixtures';
import { mockLiveEvent } from './live-fixtures';
import {
  DEFAULT_AUDIO_CONFIG,
  type AudioConfig,
  type RoundAudioCue,
  type TeamAudioResult,
} from '../src/app/core/audio/audio-types';
export async function mockAudio(
  page: Page,
  lang: 'en' | 'ar' = 'en',
  team = false,
  subscribed = true,
  role?: 'OWNER' | 'EVENT_ADMIN' | 'REFEREE',
) {
  const live = role
    ? await mockLiveEvent(page, { lang, role: role === 'OWNER' ? 'EVENT_ADMIN' : role })
    : undefined;
  if (live && role === 'OWNER') live.profile.system_role = 'OWNER';
  if (!role) await mockPublicEvent(page);
  await page.addInitScript(
    ({ lang, team, eventId }) => {
      localStorage.setItem('bts.lang', lang);
      if (team) localStorage.setItem(`bts.team.${eventId}`, 'T01');
      const buffers = new WeakMap<AudioBuffer, string>();
      const bytes = new WeakMap<ArrayBuffer, string>();
      const request = window.fetch.bind(window);
      window.fetch = async (...args) => {
        const response = await request(...args);
        const url = String(args[0]);
        if (url.includes('/sounds/')) {
          const original = response.arrayBuffer.bind(response);
          response.arrayBuffer = async () => {
            const buffer = await original();
            bytes.set(buffer, url);
            return buffer;
          };
        }
        return response;
      };
      const decode = AudioContext.prototype.decodeAudioData;
      AudioContext.prototype.decodeAudioData = function (data: ArrayBuffer, ...rest: any[]) {
        const pending = decode.call(this, data, ...rest);
        void pending.then((buffer) => buffers.set(buffer, bytes.get(data) || ''));
        return pending;
      };
      (window as any).__audioStarts = [];
      (window as any).__audioContexts = [];
      const resume = AudioContext.prototype.resume;
      AudioContext.prototype.resume = function () {
        if (!(window as any).__audioContexts.includes(this))
          (window as any).__audioContexts.push(this);
        return resume.call(this);
      };
      (window as any).__audioEnds = 0;
      const start = AudioBufferSourceNode.prototype.start;
      AudioBufferSourceNode.prototype.start = function (...args: any[]) {
        (window as any).__audioStarts.push({
          clip: buffers.get(this.buffer!),
          at: Date.now(),
          duration: this.buffer?.duration,
        });
        this.addEventListener(
          'ended',
          () => {
            (window as any).__audioEnds++;
          },
          { once: true },
        );
        return start.apply(this, args as [number, number, number]);
      };
    },
    { lang, team, eventId },
  );
  const backend = {
    config: { ...DEFAULT_AUDIO_CONFIG } as AudioConfig,
    cues: [] as RoundAudioCue[],
    results: [] as TeamAudioResult[],
    roundReads: 0,
    resultReads: 0,
  };
  const headers = {
    'access-control-allow-origin': '*',
    'access-control-allow-headers': '*',
    'access-control-allow-methods': '*',
  };
  await page.route('**/rest/v1/rpc/get_current_event', (route) =>
    route.fulfill({ headers, json: { ...event, audio_config: backend.config } }),
  );
  await page.route('**/rest/v1/rpc/get_recent_round_cues', (route) => {
    backend.roundReads++;
    return route.fulfill({
      headers,
      json: { serverNow: new Date().toISOString(), config: backend.config, cues: backend.cues },
    });
  });
  await page.route('**/rest/v1/rpc/get_team_audio_results', (route) => {
    expect(route.request().postDataJSON().p_team_code).toBe('T01');
    backend.resultReads++;
    return route.fulfill({
      headers,
      json: {
        serverNow: new Date().toISOString(),
        config: backend.config,
        results: backend.results,
      },
    });
  });
  let socket: WebSocketRoute | undefined;
  let arrayFrames = true;
  await page.routeWebSocket('**/realtime/v1/websocket**', (ws) => {
    socket = ws;
    ws.onMessage((message) => {
      const data = JSON.parse(String(message));
      arrayFrames = Array.isArray(data);
      const frame = Array.isArray(data)
        ? { join_ref: data[0], ref: data[1], topic: data[2], event: data[3], payload: data[4] }
        : data;
      if (frame.event === 'heartbeat' || (frame.event === 'phx_join' && subscribed)) {
        const reply = {
          join_ref: frame.join_ref,
          ref: frame.ref,
          topic: frame.topic,
          event: 'phx_reply',
          payload: { status: 'ok', response: { postgres_changes: [] } },
        };
        ws.send(
          JSON.stringify(
            Array.isArray(data)
              ? [reply.join_ref, reply.ref, reply.topic, reply.event, reply.payload]
              : reply,
          ),
        );
        if (frame.event === 'phx_join') {
          const payload = {
            extension: 'system',
            status: 'ok',
            message: 'Replication connection established',
            channel: frame.topic,
          };
          ws.send(
            JSON.stringify(
              Array.isArray(data)
                ? [frame.join_ref, null, frame.topic, 'system', payload]
                : { topic: frame.topic, event: 'system', payload },
            ),
          );
        }
      }
    });
  });
  return {
    live,
    backend,
    emit: async (name: string, payload: unknown) => {
      await expect.poll(() => !!socket).toBe(true);
      const broadcast = { type: 'broadcast', event: name, payload };
      socket!.send(
        JSON.stringify(
          arrayFrames
            ? [null, null, `realtime:event:${eventId}`, 'broadcast', broadcast]
            : { topic: `realtime:event:${eventId}`, event: 'broadcast', payload: broadcast },
        ),
      );
    },
  };
}
export const starts = (page: Page) =>
  page.evaluate(
    () => ((window as any).__audioStarts || []) as { clip: string; at: number; duration: number }[],
  );
