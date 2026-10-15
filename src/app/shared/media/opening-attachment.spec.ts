import { describe, expect, it } from 'vitest';
import { openingAttachmentUrl, prepareOpeningAttachment } from './opening-attachment';

describe('opening attachment validation', () => {
  const path =
    '44000000-0000-0000-0000-000000000001/66000000-0000-0000-0000-000000000001/55000000-0000-0000-0000-000000000001.pdf';
  it('resolves only typed event/round assets', () => {
    expect(openingAttachmentUrl({ path, mime: 'application/pdf', title: null })).toContain(
      `/opening-attachments/${path}`,
    );
    expect(openingAttachmentUrl({ path, mime: 'image/webp', title: null })).toBe('');
    expect(
      openingAttachmentUrl({
        path: 'https://example.com/file.pdf',
        mime: 'application/pdf',
        title: null,
      }),
    ).toBe('');
    expect(
      openingAttachmentUrl({ path: `${path}?token=1`, mime: 'application/pdf', title: null }),
    ).toBe('');
    expect(openingAttachmentUrl(null)).toBe('');
  });
  const pdf = (header: string, size = header.length) =>
    ({
      type: 'application/pdf',
      size,
      slice: (start: number, end: number) => ({
        arrayBuffer: async () => new TextEncoder().encode(header.slice(start, end)).buffer,
      }),
    }) as unknown as File;
  it('accepts PDF headers within the upload cap', async () => {
    const file = pdf('%PDF-1.7');
    expect(await prepareOpeningAttachment(file)).toBe(file);
  });
  it('rejects empty, oversized and disguised PDFs', async () => {
    for (const file of [pdf('%PDF-1.7', 0), pdf('%PDF-1.7', 10 * 1024 * 1024 + 1), pdf('<html>')])
      await expect(prepareOpeningAttachment(file)).rejects.toThrow('INVALID_ATTACHMENT');
  });
});
