import { useNavigate } from 'react-router-dom';
import { devSignIn } from '../api/client';
import { useStore, type Role } from '../store';
import { DEMO_MODE } from './install';

const VIEWS: { role: Role; label: string; to: string }[] = [
  { role: 'victim', label: 'Person', to: '/' },
  { role: 'counselor', label: 'Counselor', to: '/counselor' },
  { role: 'admin', label: 'Admin', to: '/admin' },
];

/**
 * Prototype-only strip: says plainly that the data is sample data, and lets a
 * reviewer switch between the three roles without a real identity provider.
 * Rendered below the crisis bar so the helplines stay first on every screen.
 */
export function DemoBar() {
  const navigate = useNavigate();
  const role = useStore((s) => s.session.role);
  if (!DEMO_MODE) return null;

  async function switchTo(v: (typeof VIEWS)[number]) {
    // Step off the person's screens first: their gate re-signs a non-victim
    // session back in as the person, which would undo a staff sign-in.
    navigate('/staff');
    await devSignIn(v.role);
    navigate(v.to);
  }

  return (
    <div className="border-b border-ice-300 bg-ice-50 text-navy-900">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-3 gap-y-1 px-4 py-1.5 text-xs">
        <span>
          <strong>Prototype</strong> · sample data, runs entirely in your browser
        </span>
        <span className="ml-auto flex items-center gap-1" role="group" aria-label="Switch prototype view">
          View as
          {VIEWS.map((v) => (
            <button
              key={v.role}
              type="button"
              aria-pressed={role === v.role}
              onClick={() => void switchTo(v)}
              className={`rounded-full px-2.5 py-0.5 font-medium ${
                role === v.role ? 'bg-navy-900 text-white' : 'border border-ice-300 bg-white hover:bg-ice-100'
              }`}
            >
              {v.label}
            </button>
          ))}
        </span>
      </div>
    </div>
  );
}
