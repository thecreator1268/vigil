/**
 * Counselor passkey (WebAuthn) login — production replacement for dev-idp's
 * counselor role. Hand-fetched against /auth/passkey/* (pre-authentication,
 * outside the typed OpenAPI contract client, same pattern as devSignIn in
 * ./client.ts) rather than through the typed `api` client.
 */
import { startAuthentication, startRegistration } from '@simplewebauthn/browser';
import { useStore } from '../store';
import { HttpStatusError } from './client';

async function post<T>(path: string, body: unknown, bearer?: string): Promise<T> {
  const res = await fetch(path, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...(bearer ? { authorization: `Bearer ${bearer}` } : {}) },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(60_000), // a passkey ceremony needs real time for the user to act
  });
  const json = await res.json();
  if (!res.ok) throw new HttpStatusError(res.status, (json as { message?: string }).message ?? res.statusText);
  return json as T;
}

/**
 * Register a new passkey. Exactly one of `enrollmentToken` (first-time or
 * admin-assisted recovery enrollment) or an already-signed-in counselor
 * session (adding a second passkey) must apply.
 */
export async function registerPasskey(enrollmentToken?: string): Promise<void> {
  const bearer = enrollmentToken ? undefined : (useStore.getState().session.token ?? undefined);
  const { attemptId, options } = await post<{ attemptId: string; options: Parameters<typeof startRegistration>[0]['optionsJSON'] }>(
    '/auth/passkey/registration/options',
    enrollmentToken ? { enrollmentToken } : {},
    bearer,
  );
  const credential = await startRegistration({ optionsJSON: options });
  await post('/auth/passkey/registration/verify', { attemptId, credential });
}

/** Usernameless login: the browser's passkey picker resolves identity, not a typed username. */
export async function loginWithPasskey(): Promise<void> {
  const { attemptId, options } = await post<{ attemptId: string; options: Parameters<typeof startAuthentication>[0]['optionsJSON'] }>(
    '/auth/passkey/login/options',
    {},
  );
  const credential = await startAuthentication({ optionsJSON: options });
  const body = await post<{ access_token: string; sub: string }>('/auth/passkey/login/verify', { attemptId, credential });
  useStore.getState().setSession({ role: 'counselor', token: body.access_token, subject: body.sub, expiresAt: null });
}
