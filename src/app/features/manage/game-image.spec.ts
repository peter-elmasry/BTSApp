import { afterEach, describe, expect, it, vi } from 'vitest';
import { prepareGameImage } from './game-image';

afterEach(() => vi.restoreAllMocks());
describe('game image conversion failures', () => {
  it('rejects unsupported and oversized sources before decoding', async () => {
    await expect(
      prepareGameImage(new File(['svg'], 'x.svg', { type: 'image/svg+xml' })),
    ).rejects.toThrow();
    await expect(
      prepareGameImage(
        new File([new Uint8Array(20 * 1024 * 1024 + 1)], 'x.png', { type: 'image/png' }),
      ),
    ).rejects.toThrow();
  });
  it('closes decoded resources when the image exceeds the pixel budget', async () => {
    const close = vi.fn();
    vi.stubGlobal(
      'createImageBitmap',
      vi.fn().mockResolvedValue({ width: 10000, height: 10000, close }),
    );
    await expect(
      prepareGameImage(new File(['png'], 'x.png', { type: 'image/png' })),
    ).rejects.toThrow();
    expect(close).toHaveBeenCalledOnce();
    vi.unstubAllGlobals();
  });
  it('rejects a browser encoder fallback and closes the bitmap', async () => {
    const close = vi.fn();
    vi.stubGlobal(
      'createImageBitmap',
      vi.fn().mockResolvedValue({ width: 100, height: 50, close }),
    );
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
      drawImage: vi.fn(),
    } as any);
    vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation((callback) =>
      callback(new Blob(['png'], { type: 'image/png' })),
    );
    await expect(
      prepareGameImage(new File(['png'], 'x.png', { type: 'image/png' })),
    ).rejects.toThrow();
    expect(close).toHaveBeenCalledOnce();
    vi.unstubAllGlobals();
  });
});
