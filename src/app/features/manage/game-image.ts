const MAX_SOURCE_BYTES = 20 * 1024 * 1024;
const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;

/** Decode first: MIME metadata alone does not prove an image is usable. */
export async function prepareGameImage(source: File): Promise<File> {
  if (
    !['image/jpeg', 'image/png', 'image/webp'].includes(source.type) ||
    source.size === 0 ||
    source.size > MAX_SOURCE_BYTES
  )
    throw new Error('INVALID_IMAGE');
  const bitmap = await createImageBitmap(source);
  try {
    if (!bitmap.width || !bitmap.height || bitmap.width * bitmap.height > 40_000_000)
      throw new Error('INVALID_IMAGE');
    const scale = Math.min(1, 1024 / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const context = canvas.getContext('2d');
    if (!context) throw new Error('INVALID_IMAGE');
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, 'image/webp', 0.85),
    );
    // Browsers may fall back to PNG when the requested encoder is unavailable.
    if (!blob || blob.type !== 'image/webp' || blob.size > MAX_UPLOAD_BYTES)
      throw new Error('INVALID_IMAGE');
    return new File([blob], `${source.name.replace(/\.[^.]*$/, '') || 'game'}.webp`, {
      type: 'image/webp',
    });
  } finally {
    bitmap.close();
  }
}
