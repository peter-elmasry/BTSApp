import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BufferedAudio } from './buffered-audio';
describe('activated buffered audio', () => {
  let context: any;
  let sources: any[];
  let order: string[];
  beforeEach(() => {
    sources = [];
    order = [];
    vi.stubGlobal(
      'AudioContext',
      class {
        state = 'suspended';
        destination = {};
        onstatechange: () => void = () => {};
        constructor() {
          context = this;
          order.push('context');
        }
        createGain() {
          return { gain: { value: 0 }, connect: vi.fn() };
        }
        resume() {
          order.push('resume');
          this.state = 'running';
          return Promise.resolve();
        }
        suspend() {
          this.state = 'suspended';
          return Promise.resolve();
        }
        close() {
          this.state = 'closed';
          return Promise.resolve();
        }
        decodeAudioData(data: ArrayBuffer) {
          return Promise.resolve({ duration: 10, id: new Uint8Array(data)[0] });
        }
        createBufferSource() {
          const source = {
            buffer: null,
            onended: null,
            start: vi.fn(),
            stop: vi.fn(),
            connect: vi.fn(),
            disconnect: vi.fn(),
          };
          sources.push(source);
          return source;
        }
      },
    );
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        order.push('fetch');
        return {
          ok: true,
          arrayBuffer: async () =>
            new Uint8Array([url.includes('round-end') ? 2 : url.includes('round-start') ? 1 : 3])
              .buffer,
        };
      }),
    );
  });
  afterEach(() => vi.unstubAllGlobals());
  it('creates/resumes only after enable, before asset requests', async () => {
    const audio = new BufferedAudio(vi.fn());
    expect(order).toEqual([]);
    await audio.enable();
    expect(order.slice(0, 3)).toEqual(['context', 'resume', 'fetch']);
    expect(fetch).toHaveBeenCalledTimes(5);
    expect(sources).toHaveLength(0);
    audio.destroy();
  });
  it('prioritizes round cues, preserves end/start ordering and cancels on mute', async () => {
    const audio = new BufferedAudio(vi.fn());
    await audio.enable();
    audio.enqueue('match-win', () => true);
    audio.enqueue('match-loss', () => true);
    audio.enqueue('round-end', () => true);
    audio.enqueue('round-start', () => true);
    expect(sources[0].stop).toHaveBeenCalledTimes(1);
    expect(sources[1].buffer.id).toBe(2);
    expect(sources[1].start).toHaveBeenCalledWith(0, 0, 4);
    sources[1].onended();
    expect(sources[2].buffer.id).toBe(1);
    audio.mute();
    expect(sources[2].stop).toHaveBeenCalledTimes(1);
    expect(context.state).toBe('suspended');
    audio.enqueue('match-draw', () => true);
    expect(sources).toHaveLength(3);
    audio.destroy();
  });
  it('drops queued sounds when their permission/freshness changes', async () => {
    const audio = new BufferedAudio(vi.fn());
    await audio.enable();
    let allowed = true;
    audio.enqueue('round-end', () => true);
    audio.enqueue('round-start', () => allowed);
    allowed = false;
    sources[0].onended();
    expect(sources).toHaveLength(1);
    audio.destroy();
  });
  it('keeps missing files silent and reports them without failing the other cues', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => ({
        ok: !url.includes('match-draw'),
        arrayBuffer: async () => new Uint8Array([1]).buffer,
      })),
    );
    const audio = new BufferedAudio(vi.fn());
    expect(await audio.enable()).toEqual(['match-draw']);
    audio.enqueue('match-draw', () => true);
    expect(sources).toHaveLength(0);
    audio.enqueue('match-win', () => true);
    expect(sources).toHaveLength(1);
    audio.destroy();
  });
});
