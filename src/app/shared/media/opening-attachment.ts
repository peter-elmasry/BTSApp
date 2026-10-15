import { environment } from '../../../environments/environment';
import { preparePublicImage } from './prepare-public-image';

export interface OpeningAttachment {
  path: string;
  mime: 'image/webp' | 'application/pdf';
  title: string | null;
}

export function openingAttachmentUrl(attachment: OpeningAttachment | null | undefined): string {
  if (!attachment) return '';
  const uuid = '[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}';
  const extension =
    attachment.mime === 'image/webp' ? 'webp' : attachment.mime === 'application/pdf' ? 'pdf' : '';
  if (
    !extension ||
    !new RegExp(`^${uuid}/${uuid}/${uuid}[.]${extension}$`, 'i').test(attachment.path)
  )
    return '';
  return `${(environment.supabaseUrl || 'http://127.0.0.1:54321').replace(/\/$/, '')}/storage/v1/object/public/opening-attachments/${attachment.path}`;
}

export async function prepareOpeningAttachment(source: File): Promise<File> {
  if (source.type !== 'application/pdf') return preparePublicImage(source);
  if (!source.size || source.size > 10 * 1024 * 1024) throw new Error('INVALID_ATTACHMENT');
  const header = new TextDecoder().decode(await source.slice(0, 5).arrayBuffer());
  if (header !== '%PDF-') throw new Error('INVALID_ATTACHMENT');
  return source;
}
