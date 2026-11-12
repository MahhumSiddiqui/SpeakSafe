import { ApiError, getCsrfToken } from './api';

// Raw (binary) requests for encrypted files.
export async function postBytes(path: string, body: Uint8Array, headers: Record<string, string> = {}) {
  let res: Response;
  try {
    res = await fetch(`/api${path}`, {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/octet-stream', 'X-CSRF-Token': getCsrfToken(), ...headers },
      body: body as BodyInit,
    });
  } catch {
    throw new ApiError(0, 'errors.network');
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(res.status, (data as { error?: string }).error ?? 'errors.generic');
  return data as { id: string };
}

export async function getBytes(path: string, headers: Record<string, string> = {}): Promise<Uint8Array> {
  let res: Response;
  try {
    res = await fetch(`/api${path}`, { credentials: 'same-origin', headers });
  } catch {
    throw new ApiError(0, 'errors.network');
  }
  if (!res.ok) throw new ApiError(res.status, 'errors.generic');
  return new Uint8Array(await res.arrayBuffer());
}
