import { useState } from 'react';
import { browserSupportsWebAuthn } from '@simplewebauthn/browser';
import { FiBarChart2, FiKey, FiUsers } from 'react-icons/fi';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { IconBadge } from '@vigil/design-system';
import { devSignIn } from '../../api/client';
import { loginWithPasskey, registerPasskey } from '../../api/passkey';
import type { Role } from '../../store';

/**
 * Staff sign-in. Counselors sign in with a passkey in production
 * (services/counselor-identity-service) — feature-detected, so the button
 * only shows where WebAuthn exists. The dev-idp buttons stay visible
 * unconditionally rather than being hidden behind a build-time flag: this
 * project's e2e suite signs in through them against the same production-mode
 * build docker-compose runs, and the real safety boundary is already
 * server-side (the gateway and dev-idp both refuse to serve dev tokens
 * outside an explicit development/test NODE_ENV — see
 * docs/design/counselor-passkey-login.md §6) rather than anything the UI
 * needs to re-enforce. Admin has no passkey option yet — see that doc's §7.
 */
export function StaffSignIn() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [error, setError] = useState<string | null>(null);
  const [enrollmentToken, setEnrollmentToken] = useState('');
  const [enrolling, setEnrolling] = useState(false);
  const [enrolled, setEnrolled] = useState(false);
  const passkeysSupported = browserSupportsWebAuthn();

  async function signIn(role: Exclude<Role, 'victim'>) {
    try {
      await devSignIn(role);
      navigate(params.get('next') ?? (role === 'admin' ? '/admin' : '/counselor'));
    } catch {
      setError('Sign-in is unavailable. Check your connection and try again.');
    }
  }

  async function signInWithPasskey() {
    try {
      await loginWithPasskey();
      navigate(params.get('next') ?? '/counselor');
    } catch {
      setError('Sign-in is unavailable. Check your connection and try again.');
    }
  }

  async function enrollWithToken(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setEnrolling(true);
    try {
      await registerPasskey(enrollmentToken.trim());
      setEnrolled(true);
    } catch {
      setError('That enrollment link did not work. It may have expired or already been used — ask your administrator for a new one.');
    } finally {
      setEnrolling(false);
    }
  }

  return (
    <section aria-labelledby="staff-title" className="mx-auto max-w-md space-y-6">
      <header>
        <h1 id="staff-title" className="text-2xl font-semibold text-navy-900">Staff sign-in</h1>
        <p className="mt-1 text-sm text-ink-muted">Development sign-in — issues a short-lived role token from the local dev identity provider.</p>
      </header>
      <div className="grid gap-3">
        {passkeysSupported && (
          <button type="button" onClick={() => void signInWithPasskey()} className="flex items-center gap-4 rounded-2xl border border-ice-300 bg-white p-4 text-left hover:border-navy-500">
            <IconBadge icon={FiKey} />
            <span><span className="block font-semibold text-navy-900">Sign in with a passkey</span><span className="text-sm text-ink-muted">For counselors — no password, no typing</span></span>
          </button>
        )}
        <button type="button" onClick={() => void signIn('counselor')} className="flex items-center gap-4 rounded-2xl border border-ice-300 bg-white p-4 text-left hover:border-navy-500">
          <IconBadge icon={FiUsers} />
          <span><span className="block font-semibold text-navy-900">Counselor</span><span className="text-sm text-ink-muted">Alert queue, what people told us, trends</span></span>
        </button>
        <button type="button" onClick={() => void signIn('admin')} className="flex items-center gap-4 rounded-2xl border border-ice-300 bg-white p-4 text-left hover:border-navy-500">
          <IconBadge icon={FiBarChart2} />
          <span><span className="block font-semibold text-navy-900">District / State admin</span><span className="text-sm text-ink-muted">Anonymized regional rollups only</span></span>
        </button>
      </div>
      {error && <p role="alert" className="rounded-xl bg-elevated-100 p-3 text-sm text-elevated-700">{error}</p>}

      {passkeysSupported && (
        <details className="rounded-2xl border border-ice-300 bg-white p-4">
          <summary className="cursor-pointer font-semibold text-navy-900">Have an enrollment link from your administrator?</summary>
          {enrolled ? (
            <p className="mt-3 text-sm text-ink-muted">Your passkey is registered. Use "Sign in with a passkey" above.</p>
          ) : (
            <form className="mt-3 space-y-3" onSubmit={(e) => void enrollWithToken(e)}>
              <label className="block text-sm text-ink-muted" htmlFor="enrollment-token">Enrollment token</label>
              <input
                id="enrollment-token"
                type="text"
                value={enrollmentToken}
                onChange={(e) => setEnrollmentToken(e.target.value)}
                className="w-full rounded-xl border border-ice-300 p-2"
                autoComplete="off"
              />
              <button type="submit" disabled={enrolling || !enrollmentToken.trim()} className="rounded-xl bg-navy-500 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">
                {enrolling ? 'Registering…' : 'Register this device as a passkey'}
              </button>
            </form>
          )}
        </details>
      )}
    </section>
  );
}
