import { PDFDocument } from 'pdf-lib';

// Hidden details (location, time taken, device model, author names) are removed in the browser,
// BEFORE encryption, because the server can never see inside encrypted files to clean them.
export const MAX_FILE_BYTES = 10 * 1024 * 1024;
const MAX_SIDE = 2560;

export type FileKind = 'image' | 'pdf' | 'voice';
export interface CleanFile { kind: FileKind; mime: string; bytes: Uint8Array }

export function kindOf(file: File): FileKind | null {
  if (/^image\/(jpeg|png|webp|heic|heif)$/.test(file.type)) return 'image';
  if (file.type === 'application/pdf') return 'pdf';
  return null;
}

/** Images are redrawn on a canvas and saved as a new JPEG: no EXIF, GPS or camera data survives. */
async function cleanImage(file: File): Promise<CleanFile> {
  const bmp = await createImageBitmap(file, { imageOrientation: 'from-image' });
  const scale = Math.min(1, MAX_SIDE / Math.max(bmp.width, bmp.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bmp.width * scale);
  canvas.height = Math.round(bmp.height * scale);
  canvas.getContext('2d')!.drawImage(bmp, 0, 0, canvas.width, canvas.height);
  bmp.close();
  const blob = await new Promise<Blob>((res, rej) => canvas.toBlob((b) => (b ? res(b) : rej(new Error('encode'))), 'image/jpeg', 0.88));
  return { kind: 'image', mime: 'image/jpeg', bytes: new Uint8Array(await blob.arrayBuffer()) };
}

/** PDFs: pages are copied into a brand-new document, and document information fields are blanked. */
async function cleanPdf(file: File): Promise<CleanFile> {
  const src = await PDFDocument.load(await file.arrayBuffer(), { updateMetadata: false });
  const out = await PDFDocument.create({ updateMetadata: false });
  const pages = await out.copyPages(src, src.getPageIndices());
  pages.forEach((p) => out.addPage(p));
  out.setTitle('');
  out.setAuthor('');
  out.setSubject('');
  out.setKeywords([]);
  out.setCreator('SpeakSafe');
  out.setProducer('SpeakSafe');
  out.setCreationDate(new Date(0));
  out.setModificationDate(new Date(0));
  return { kind: 'pdf', mime: 'application/pdf', bytes: await out.save() };
}

export async function cleanFile(file: File): Promise<CleanFile> {
  const kind = kindOf(file);
  if (!kind) throw new Error('type');
  if (file.size > MAX_FILE_BYTES) throw new Error('size');
  return kind === 'image' ? cleanImage(file) : cleanPdf(file);
}

export const formatSize = (n: number) => (n < 1024 * 1024 ? `${Math.max(1, Math.round(n / 1024))} KB` : `${(n / 1024 / 1024).toFixed(1)} MB`);
export const formatDuration = (sec: number) => `${Math.floor(sec / 60)}:${String(Math.round(sec % 60)).padStart(2, '0')}`;
