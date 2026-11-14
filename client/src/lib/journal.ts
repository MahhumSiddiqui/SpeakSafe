import type { TFunction } from 'i18next';
import { api } from './api';
import { getBytes, postBytes } from './binary';
import { decryptBytes, encryptBytes, openJson, sealJson } from './reportCrypto';
import type { FileKind } from './media';
import { emptyDraft, loadDraft, uploadDraftFile, type FileRef } from '../pages/report/draft';

// The private journal and evidence locker. Entries and files are encrypted with the account's
// master key before they leave the browser; the server only ever stores ciphertext.

export type DatePart = 'early' | 'mid' | 'late' | 'any';
export type EntryDate =
  | { kind: 'exact'; date: string } // YYYY-MM-DD
  | { kind: 'month'; month: string; part: DatePart } // YYYY-MM
  | { kind: 'unsure' };
export interface EntryData { v: 1; date: EntryDate; text: string; where: string; fileIds: string[] }
export interface Entry extends EntryData { id: string; createdAt: string; updatedAt: string }
export interface LockerMeta { v: 1; kind: FileKind; mime: string; label: string; seconds?: number }
export interface LockerItem extends LockerMeta { id: string; size: number; createdAt: string }

export const MAX_REPORT_FILES = 10; // same limit as the report wizard
export const MAX_REPORT_VOICE = 2; // the draft holds at most 12 files in total

export const blankEntry = (): EntryData => ({ v: 1, date: { kind: 'exact', date: today() }, text: '', where: '', fileIds: [] });
export function today() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// ---- Entries ----
export async function loadEntries(mk: Uint8Array): Promise<Entry[]> {
  const rows = await api<{ id: string; ciphertext: string; createdAt: string; updatedAt: string }[]>('/reporter/journal/entries');
  const out: Entry[] = [];
  for (const r of rows) {
    try {
      out.push({ ...(await openJson<EntryData>(mk, r.ciphertext)), id: r.id, createdAt: r.createdAt, updatedAt: r.updatedAt });
    } catch {
      /* an entry that cannot be opened is skipped rather than breaking the journal */
    }
  }
  return out;
}

export async function saveEntry(mk: Uint8Array, data: EntryData, id?: string) {
  const ciphertext = await sealJson(mk, data);
  if (id) {
    await api(`/reporter/journal/entries/${id}`, { method: 'PUT', body: { ciphertext } });
    return id;
  }
  return (await api<{ id: string }>('/reporter/journal/entries', { method: 'POST', body: { ciphertext } })).id;
}

export const deleteEntry = (id: string) => api(`/reporter/journal/entries/${id}`, { method: 'DELETE' });

// ---- Locker ----
export async function loadLocker(mk: Uint8Array): Promise<LockerItem[]> {
  const rows = await api<{ id: string; meta: string; size: number; createdAt: string }[]>('/reporter/journal/files');
  const out: LockerItem[] = [];
  for (const r of rows) {
    try {
      out.push({ ...(await openJson<LockerMeta>(mk, r.meta)), id: r.id, size: r.size, createdAt: r.createdAt });
    } catch {
      /* skip unreadable */
    }
  }
  return out;
}

export async function addToLocker(mk: Uint8Array, bytes: Uint8Array, meta: LockerMeta): Promise<LockerItem> {
  const res = (await postBytes('/reporter/journal/files', await encryptBytes(mk, bytes), { 'X-Locker-Meta': await sealJson(mk, meta) })) as { id: string; createdAt?: string };
  return { ...meta, id: res.id, size: bytes.length, createdAt: res.createdAt ?? new Date().toISOString() };
}

export const readLocker = async (mk: Uint8Array, id: string) => decryptBytes(mk, await getBytes(`/reporter/journal/files/${id}`));
export const deleteLocker = (id: string) => api(`/reporter/journal/files/${id}`, { method: 'DELETE' });

// ---- Dates ----
const PART_DAY: Record<DatePart, string> = { early: '05', mid: '15', any: '15', late: '25' };

/** Sort key: entries with an exact or rough date in date order; "not sure" entries last, by when they were written. */
export function sortKey(e: Pick<Entry, 'date' | 'createdAt'>) {
  if (e.date.kind === 'exact') return `${e.date.date}|${e.createdAt}`;
  if (e.date.kind === 'month') return `${e.date.month}-${PART_DAY[e.date.part]}|${e.createdAt}`;
  return `9999|${e.createdAt}`;
}

export function groupKey(e: Pick<Entry, 'date'>) {
  if (e.date.kind === 'exact') return e.date.date.slice(0, 7);
  if (e.date.kind === 'month') return e.date.month;
  return 'unsure';
}

const asDate = (ymd: string) => {
  const [y, m, d] = ymd.split('-').map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
};

export function monthLabel(month: string, lang: string) {
  return asDate(`${month}-01`).toLocaleDateString(lang, { month: 'long', year: 'numeric' });
}

export function dateLabel(date: EntryDate, t: TFunction, lang: string) {
  if (date.kind === 'exact') return asDate(date.date).toLocaleDateString(lang, { weekday: 'short', day: 'numeric', month: 'long', year: 'numeric' });
  if (date.kind === 'month') return t(`journal.part.${date.part}`, { month: monthLabel(date.month, lang) });
  return t('journal.dateUnsure');
}

// ---- "Use these in a report" ----
/**
 * Copies the chosen entries (as text) and files (decrypted here, re-encrypted for the draft) into the
 * report draft, adding to anything already there. Nothing is sent to the committee until the person
 * reviews the report and presses Send.
 */
export async function copyToReport(mk: Uint8Array, entries: Entry[], fileIds: string[], locker: LockerItem[], t: TFunction, lang: string) {
  const saved = await loadDraft(mk);
  const d = saved?.draft ?? emptyDraft();
  const sorted = [...entries].sort((a, b) => sortKey(a).localeCompare(sortKey(b)));

  // Chosen files, plus the files attached to the chosen entries (each copied once).
  const ids = new Set<string>(fileIds);
  sorted.forEach((e) => e.fileIds.forEach((id) => ids.add(id)));
  const chosen = locker.filter((f) => ids.has(f.id));
  const voice = chosen.filter((f) => f.kind === 'voice');
  const docs = chosen.filter((f) => f.kind !== 'voice');
  if (d.files.length + docs.length > MAX_REPORT_FILES) throw new Error('tooManyFiles');
  if (d.voice.length + voice.length > MAX_REPORT_VOICE) throw new Error('tooManyVoice');

  const text = sorted
    .filter((e) => e.text.trim() || e.where.trim())
    .map((e) => `${dateLabel(e.date, t, lang)}${e.where.trim() ? ` · ${e.where.trim()}` : ''}\n${e.text.trim()}`.trim())
    .join('\n\n');
  if (text) d.description = d.description.trim() ? `${d.description.trim()}\n\n${text}` : text;

  for (const f of chosen) {
    const bytes = await readLocker(mk, f.id);
    const fileId = await uploadDraftFile(mk, bytes);
    const ref: FileRef = { fileId, kind: f.kind, mime: f.mime, size: bytes.length, label: f.label, ...(f.seconds ? { seconds: f.seconds } : {}) };
    if (f.kind === 'voice') d.voice.push(ref);
    else d.files.push(ref);
  }
  await api('/reporter/draft', { method: 'PUT', body: { ciphertext: await sealJson(mk, d) } });
  return { entries: sorted.length, files: chosen.length };
}
