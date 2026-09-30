import { lazy, Suspense, useEffect, useState, type ReactNode } from 'react';
import { FiLogOut } from 'react-icons/fi';
import { BrowserRouter, Navigate, Outlet, Route, Routes, useLocation } from 'react-router-dom';
import { devSignIn } from './api/client';
import { Frame, VictimShell } from './components/AppShell';
import { CheckInFlow } from './features/checkin/CheckInFlow';
import { CrisisResources } from './features/crisis/CrisisResources';
import { Onboarding } from './features/onboarding/Onboarding';
import { StaffSignIn } from './features/staff/StaffSignIn';
import { Home } from './features/victim/Home';
import { MyEntries } from './features/victim/MyEntries';
import { Reminders } from './features/victim/Reminders';
import { Sharing } from './features/victim/Sharing';
import { setLanguage } from './i18n';
import { useStore, type Role } from './store';
import { pullVictimData } from './sync/engine';

// Staff screens (charts, PDF export) are split out of the victim's first load.
const AlertQueue = lazy(() => import('./features/counselor/AlertQueue').then((m) => ({ default: m.AlertQueue })));
const AlertDetail = lazy(() => import('./features/counselor/AlertDetail').then((m) => ({ default: m.AlertDetail })));
const AdminDashboard = lazy(() => import('./features/admin/AdminDashboard').then((m) => ({ default: m.AdminDashboard })));

/** Wait for the Dexie-persisted slices before rendering anything stateful. */
function useHydrated() {
  const [ok, setOk] = useState(useStore.persist.hasHydrated());
  useEffect(() => useStore.persist.onFinishHydration(() => setOk(true)), []);
  return ok;
}

function VictimGate() {
  const onboarded = useStore((s) => s.ui.onboarded);
  const role = useStore((s) => s.session.role);
  const { pathname } = useLocation();

  // A victim device signs in quietly when online; offline it works entirely locally.
  useEffect(() => {
    if (role !== 'victim' && navigator.onLine) {
      devSignIn('victim', import.meta.env.VITE_DEMO_VICTIM_ID as string | undefined)
        .then(() => pullVictimData())
        .catch(() => undefined);
    }
  }, [role]);

  if (!onboarded && pathname !== '/help') return <Navigate to="/welcome" replace />;
  return <Outlet />;
}

function StaffGate({ role }: { role: Exclude<Role, 'victim'> }) {
  const session = useStore((s) => s.session);
  const { pathname } = useLocation();
  if (session.role !== role) return <Navigate to={`/staff?next=${encodeURIComponent(pathname)}`} replace />;
  return (
    <Suspense fallback={<p className="text-ink-muted">Loading…</p>}>
      <Outlet />
    </Suspense>
  );
}

function StaffTitle({ label }: { label: string }): ReactNode {
  const signOut = useStore((s) => s.signOut);
  return (
    <>
      <span className="rounded-full bg-ice-100 px-2.5 py-0.5 text-xs font-semibold text-navy-700">{label}</span>
      <button type="button" onClick={signOut} className="inline-flex items-center gap-1 text-xs text-ink-muted hover:text-navy-900" aria-label="Sign out">
        <FiLogOut aria-hidden /> Sign out
      </button>
    </>
  );
}

export function App() {
  const hydrated = useHydrated();
  const language = useStore((s) => s.ui.language);
  useEffect(() => setLanguage(language), [language]);

  if (!hydrated) return null;
  return (
    <BrowserRouter basename={import.meta.env.BASE_URL.replace(/\/$/, '')}>
      <Routes>
        {/* Onboarding: crisis bar still visible (Frame always renders it). */}
        <Route element={<Frame />}>
          <Route path="/welcome" element={<Onboarding />} />
          <Route path="/staff" element={<StaffSignIn />} />
        </Route>

        <Route element={<VictimShell />}>
          <Route path="/help" element={<CrisisResources />} />
          <Route element={<VictimGate />}>
            <Route path="/" element={<Home />} />
            <Route path="/checkin" element={<CheckInFlow />} />
            <Route path="/entries" element={<MyEntries />} />
            <Route path="/sharing" element={<Sharing />} />
            <Route path="/reminders" element={<Reminders />} />
          </Route>
        </Route>

        <Route element={<Frame wide title={<StaffTitle label="Counselor" />} />}>
          <Route element={<StaffGate role="counselor" />}>
            <Route path="/counselor" element={<AlertQueue />} />
            <Route path="/counselor/alerts/:id" element={<AlertDetail />} />
          </Route>
        </Route>
        <Route element={<Frame wide title={<StaffTitle label="Admin" />} />}>
          <Route element={<StaffGate role="admin" />}>
            <Route path="/admin" element={<AdminDashboard />} />
          </Route>
        </Route>

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
