import { api } from '../../lib/api';
import { getBytes } from '../../lib/binary';
import { caseKeys, decryptBytes, decryptReport, openContentKey } from '../../lib/reportCrypto';
import type { VaultCase } from '../../lib/vault';

export type Status = 'RECEIVED' | 'UNDER_REVIEW' | 'INQUIRY' | 'PENDING_CLOSURE' | 'CLOSED';
export interface CaseMeta {
  id: string; status: Status; category: string; mode: 'ANONYMOUS' | 'CONFIDENTIAL' | 'NAMED'; aboutOther: boolean;
  submittedAt: string; updatedAt: string; nonce: string; ciphertext: string; fingerprint: string; reporterSealedKey: string;
  attachments: { id: string; kind: 'image' | 'pdf' | 'voice'; mimeType: string; size: number; createdAt: string }[];
  firstViewedAt: string | null;
  history: { at: string; to: Status }[];
  messages: { id: string; from: 'me' | 'committee'; nonce: string; ciphertext: string; createdAt: string }[];
}
export interface ReportContent {
  category: { name: string }; aboutOther: boolean; description: string; when: string; where: string;
  identity: { mode: string; name?: string; contact?: string };
  voiceNotes: { label: string; seconds?: number }[]; files: { label: string; kind: string }[];
}

export async function fetchCase(masterKey: Uint8Array, v: VaultCase) {
  const ck = await caseKeys(masterKey, v.ref);
  const meta = await api<CaseMeta>(`/reporter/cases/${v.id}`, { headers: { 'X-Case-Auth': ck.authKey } });
  return { meta, ck };
}

export async function openCase(meta: CaseMeta, ck: Awaited<ReturnType<typeof caseKeys>>) {
  const contentKey = await openContentKey(meta.reporterSealedKey, ck.publicKey, ck.privateKey);
  const report = await decryptReport<ReportContent>(contentKey, meta.nonce, meta.ciphertext);
  return { report, contentKey };
}

export async function fetchAttachment(caseId: string, aid: string, authKey: string, contentKey: Uint8Array) {
  return decryptBytes(contentKey, await getBytes(`/reporter/cases/${caseId}/attachments/${aid}`, { 'X-Case-Auth': authKey }));
}

export const STATUS_BADGE: Record<Status, string> = {
  RECEIVED: 'badge-rec', UNDER_REVIEW: 'badge-rev', INQUIRY: 'badge-inq', PENDING_CLOSURE: 'badge-pend', CLOSED: 'badge-clo',
};
