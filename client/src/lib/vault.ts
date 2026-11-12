import { api } from './api';
import { openJson, sealJson } from './reportCrypto';

// The encrypted list of this person's cases (only their browser can read it).
export interface VaultCase { id: string; ref: string; at: string }
export interface Vault { v: 1; cases: VaultCase[] }

export async function loadVault(masterKey: Uint8Array): Promise<Vault> {
  const { vaultEnc } = await api<{ vaultEnc: string | null }>('/reporter/vault');
  if (!vaultEnc) return { v: 1, cases: [] };
  return openJson<Vault>(masterKey, vaultEnc);
}

export async function addToVault(masterKey: Uint8Array, entry: VaultCase) {
  const v = await loadVault(masterKey);
  if (!v.cases.some((c) => c.id === entry.id)) v.cases.unshift(entry);
  await api('/reporter/vault', { method: 'PUT', body: { vaultEnc: await sealJson(masterKey, v) } });
}
