/**
 * Service-to-service HTTP on the internal network. Every call carries the
 * internal token and the caller's request id, and has a hard timeout.
 */
export interface InternalClientOptions {
  token: string;
  timeoutMs?: number;
}

export class InternalCallError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
  }
}

export function createInternalClient({ token, timeoutMs = 3000 }: InternalClientOptions) {
  return async function call<T>(url: string, init: { method?: string; body?: unknown; requestId?: string } = {}): Promise<T> {
    const res = await fetch(url, {
      method: init.method ?? (init.body === undefined ? 'GET' : 'POST'),
      headers: {
        'content-type': 'application/json',
        'x-vigil-internal-token': token,
        ...(init.requestId ? { 'x-request-id': init.requestId } : {}),
      },
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!res.ok) throw new InternalCallError(`${init.method ?? 'GET'} ${url} → ${res.status}`, res.status);
    return (await res.json()) as T;
  };
}

export type InternalClient = ReturnType<typeof createInternalClient>;
