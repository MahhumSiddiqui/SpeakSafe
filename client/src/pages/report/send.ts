import { api } from '../../lib/api';
import { postBytes } from '../../lib/binary';
import { caseKeys, encryptBytes, encryptReport, newCaseRef } from '../../lib/reportCrypto';
import { addToVault } from '../../lib/vault';
import { discardDraft, readDraftFile, type ReportDraft } from './draft';
import { matchToken, normaliseId } from '../../lib/notAlone';

export interface SentResult { caseId: string; fingerprint: string; failedFiles: number; held: boolean; notAlone: boolean }

/** Lock (encrypt) everything in the browser, then send. Steps are reported for the progress message. */
export async function sendReport(masterKey: Uint8Array, d: ReportDraft, categoryName: string, onStep: (s: 'readers' | 'locking' | 'matching' | 'sending' | 'files') => void): Promise<SentResult> {
  onStep('readers');
  const prep = await api<{ readers: { id: string; displayName: string; publicKey: string }[]; token: string }>('/reports/prepare', { body: { excluded: d.excluded } });

  onStep('locking');
  const caseRef = await newCaseRef();
  const ck = await caseKeys(masterKey, caseRef);
  const report = {
    v: 1,
    category: { id: d.categoryId, name: categoryName },
    aboutOther: d.aboutOther,
    description: d.description.trim(),
    when: d.when ?? 'unsure',
    where: d.where.trim(),
    identity: d.mode === 'ANONYMOUS' ? { mode: d.mode } : { mode: d.mode, name: d.name.trim(), contact: d.contact.trim() },
    voiceNotes: d.voice.map((v) => ({ label: v.label, seconds: v.seconds })),
    files: d.files.map((f) => ({ label: f.label, kind: f.kind })),
    ...(d.subjectId.trim() ? { subjectId: normaliseId(d.subjectId) } : {}),
  };
  const enc = await encryptReport(report, prep.readers, ck.publicKey);

  // "Not alone": only an unreadable token for the person's ID leaves the browser, never the ID.
  let token: string | undefined;
  if (d.subjectId.trim()) {
    onStep('matching');
    token = await matchToken(d.subjectId);
  }

  onStep('sending');
  const { s } = { s: await import('../../lib/keys').then((m) => m.sodium()) };
  const res = await api<{ caseId: string; fingerprint: string; held: boolean; notAlone: boolean }>('/reports', {
    body: {
      token: prep.token,
      categoryId: d.categoryId,
      mode: d.mode,
      aboutOther: d.aboutOther,
      nonce: enc.nonce,
      ciphertext: enc.ciphertext,
      fingerprint: enc.fingerprint,
      sealedKeys: enc.sealedKeys,
      reporterPublicKey: s.to_base64(ck.publicKey, s.base64_variants.ORIGINAL),
      reporterSealedKey: enc.reporterSealedKey,
      caseAuthKey: ck.authKey,
      ...(token ? { matchToken: token, hold: d.hold } : {}),
    },
  });
  // Remember the case in the private vault straight away, so it is never lost.
  await addToVault(masterKey, { id: res.caseId, ref: caseRef, at: new Date().toISOString() });

  onStep('files');
  let failed = 0;
  for (const f of [...d.voice, ...d.files]) {
    try {
      const plain = await readDraftFile(masterKey, f.fileId);
      const box = await encryptBytes(enc.contentKey, plain);
      await postBytes(`/reports/${res.caseId}/attachments`, box, { 'X-Case-Auth': ck.authKey, 'X-Attachment-Kind': f.kind, 'X-Attachment-Type': f.mime });
    } catch {
      failed++;
    }
  }
  if (!failed) await discardDraft().catch(() => {});
  enc.contentKey.fill(0);
  return { caseId: res.caseId, fingerprint: res.fingerprint, failedFiles: failed, held: res.held, notAlone: res.notAlone };
}
