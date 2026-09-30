import { useState } from 'react';
import { FiBarChart2, FiUsers } from 'react-icons/fi';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { IconBadge } from '@vigil/design-system';
import { devSignIn } from '../../api/client';
import type { Role } from '../../store';

/**
 * Staff sign-in. In development this uses the dev-idp; production replaces it
 * with the OIDC authorization-code + PKCE flow of the ministry's IdP. Roles are
 * separate tokens — a counselor token cannot reach /v1/admin/* (enforced at the
 * gateway, not just hidden here).
 */
export function StaffSignIn() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [error, setError] = useState<string | null>(null);

  async function signIn(role: Exclude<Role, 'victim'>) {
    try {
      await devSignIn(role);
      navigate(params.get('next') ?? (role === 'admin' ? '/admin' : '/counselor'));
    } catch {
      setError('Sign-in is unavailable. Check your connection and try again.');
    }
  }

  return (
    <section aria-labelledby="staff-title" className="mx-auto max-w-md space-y-6">
      <header>
        <h1 id="staff-title" className="text-2xl font-semibold text-navy-900">Staff sign-in</h1>
        <p className="mt-1 text-sm text-ink-muted">Development sign-in — issues a short-lived role token from the local dev identity provider.</p>
      </header>
      <div className="grid gap-3">
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
    </section>
  );
}
