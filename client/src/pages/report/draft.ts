import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../../lib/api';
import { getBytes, postBytes } from '../../lib/binary';
import { decryptBytes, encryptBytes, openJson, sealJson } from '../../lib/reportCrypto';
import type { FileKind } from '../../lib/media';

// The unfinished report, saved encrypted with the account's master key a moment after every change.
export type Mode = 'ANONYMOUS' | 'CONFIDENTIAL' | 'NAMED';
export type When = 'week' | 'month' | 'earlier' | 'unsure';
export interface FileRef { fileId: string; kind: FileKind; mime: string; size: number; label: string; seconds?: number }
export interface ReportDraft {
  v: 1;
  step: number;
  categoryId?: number;
  aboutOther: boolean;
  method: 'type' | 'voice' | 'dictate';
  description: string;
  when?: When;
  where: string;
  voice: FileRef[];
  files: FileRef[];
  mode?: Mode;
  name: string;
  contact: string;
  excluded: string[];
}
export const emptyDraft = (): ReportDraft => ({ v: 1, step: 1, aboutOther: false, method: 'type', description: '', where: '', voice: [], files: [], name: '', contact: '', excluded: [] });

export async function loadDraft(masterKey: Uint8Array): Promise<{ draft: ReportDraft; updatedAt: string } | null> {
  const d = await api<{ ciphertext: string; updatedAt: string } | null>('/reporter/draft');
  if (!d) return null;
  try {
    return { draft: { ...emptyDraft(), ...(await openJson<ReportDraft>(masterKey, d.ciphertext)) }, updatedAt: d.updatedAt };
  } catch {
    return null;
  }
}

export async function discardDraft() {
  await api('/reporter/draft', { method: 'DELETE' });
}

export async function uploadDraftFile(masterKey: Uint8Array, bytes: Uint8Array) {
  return (await postBytes('/reporter/draft/files', await encryptBytes(masterKey, bytes))).id;
}
export async function readDraftFile(masterKey: Uint8Array, fileId: string) {
  return decryptBytes(masterKey, await getBytes(`/reporter/draft/files/${fileId}`));
}
export async function deleteDraftFile(fileId: string) {
  await api(`/reporter/draft/files/${fileId}`, { method: 'DELETE' });
}

export type SaveState = 'idle' | 'saving' | 'saved' | 'error';

/** Debounced autosave. `touched` stays false until the person changes something. */
export function useAutosave(masterKey: Uint8Array | undefined, draft: ReportDraft | null, touched: boolean) {
  const pending = useRef(false);
  const [state, setState] = useState<SaveState>('idle');
  const timer = useRef<number | undefined>(undefined);
  const latest = useRef(draft);
  latest.current = draft;

  const saveNow = useCallback(async () => {
    if (!masterKey || !latest.current) return;
    window.clearTimeout(timer.current);
    pending.current = false;
    setState('saving');
    try {
      await api('/reporter/draft', { method: 'PUT', body: { ciphertext: await sealJson(masterKey, latest.current) } });
      setState('saved');
    } catch {
      setState('error');
    }
  }, [masterKey]);

  // Typing: save after a short pause. Changing step or adding/removing a file: save at once.
  const structure = draft ? `${draft.step}|${draft.voice.length}|${draft.files.length}|${draft.mode}|${draft.categoryId}` : '';
  useEffect(() => {
    if (!touched || !draft) return;
    pending.current = true;
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(saveNow, 700);
    return () => window.clearTimeout(timer.current);
  }, [draft, touched, saveNow]);
  useEffect(() => {
    if (touched && draft) saveNow();
  }, [structure]); // eslint-disable-line react-hooks/exhaustive-deps

  // Warn before closing the tab only if something has not been saved yet.
  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => {
      if (pending.current) e.preventDefault();
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, []);

  return { state, saveNow };
}
