/** Small typed wrapper around the JSON API (same-origin, cookies included). */

export type ApiResult<T> =
  { ok: true; data: T } | { ok: false; status: number; error: { code: string; message: string } };

export async function api<T>(
  method: 'GET' | 'POST',
  path: string,
  body?: unknown,
): Promise<ApiResult<T>> {
  try {
    const res = await fetch(path, {
      method,
      credentials: 'same-origin',
      headers: body === undefined ? {} : { 'content-type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
      cache: 'no-store',
    });
    const json = (await res.json().catch(() => ({}))) as T & {
      error?: { code: string; message: string };
    };
    if (!res.ok) {
      return {
        ok: false,
        status: res.status,
        error: json.error ?? { code: 'HTTP_ERROR', message: `Request failed (${res.status}).` },
      };
    }
    return { ok: true, data: json };
  } catch {
    return {
      ok: false,
      status: 0,
      error: { code: 'NETWORK', message: 'Cannot reach the game server.' },
    };
  }
}
