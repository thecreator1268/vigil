/**
 * Typed API client. Request/response types are GENERATED from the OpenAPI
 * contract (@vigil/shared-types → openapi-typescript); nothing here is
 * hand-written against the wire format.
 */
import type { paths } from '@vigil/shared-types';
import createClient, { type Middleware } from 'openapi-fetch';
import { useStore, type Role } from '../store';

export class HttpStatusError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
  /** 4xx other than auth/timeout/rate-limit will never succeed on retry. */
  get permanent(): boolean {
    return this.status >= 400 && this.status < 500 && ![401, 408, 429].includes(this.status);
  }
}

const auth: Middleware = {
  onRequest({ request }) {
    const token = useStore.getState().session.token;
    if (token) request.headers.set('authorization', `Bearer ${token}`);
    return request;
  },
};

export const api = createClient<paths>({ baseUrl: typeof window === 'undefined' ? 'http://localhost' : window.location.origin });
api.use(auth);

/** Throw an HttpStatusError for non-2xx so queue logic can classify failures. */
export function ensureOk<T extends { response: Response; error?: unknown; data?: unknown }>(r: T): NonNullable<T['data']> {
  if (!r.response.ok) {
    const msg = (r.error as { message?: string } | undefined)?.message ?? r.response.statusText;
    throw new HttpStatusError(r.response.status, msg);
  }
  return r.data as NonNullable<T['data']>;
}

/**
 * Development sign-in via the dev-idp (through the gateway). Production swaps
 * this for the OIDC authorization-code + PKCE flow; the rest of the app only
 * ever sees `session.token`.
 */
export async function devSignIn(role: Role, subject?: string): Promise<void> {
  const res = await fetch('/auth/dev-token', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(subject ? { role, subject } : { role }),
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) throw new HttpStatusError(res.status, 'sign-in failed');
  const body = (await res.json()) as { access_token: string; sub: string };
  useStore.getState().setSession({ role, token: body.access_token, subject: body.sub, expiresAt: null });
}
