import { IconBadge } from '@vigil/design-system';
import type { AnonymizedAggregate } from '@vigil/shared-types';
import { useEffect, useState } from 'react';
import { FiAlertOctagon, FiAlertTriangle, FiCheckCircle, FiEyeOff, FiUsers } from 'react-icons/fi';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { api, ensureOk } from '../../api/client';

const REGIONS = ['pune', 'nagpur', 'nashik', 'aurangabad', 'smoke-region'];

/**
 * District/State admin view: aggregated and anonymized ONLY. Cohorts below
 * the k-anonymity threshold are suppressed server-side; this screen never
 * receives an individual identifier.
 */
export function AdminDashboard() {
  const [region, setRegion] = useState('pune');
  const [agg, setAgg] = useState<AnonymizedAggregate | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setAgg(null);
    setError(null);
    api
      .GET('/v1/admin/rollups', { params: { query: { region } } })
      .then(ensureOk)
      .then((d) => !cancelled && setAgg(d.anonymizedAggregate))
      .catch((e: Error) => !cancelled && setError(e.message));
    return () => {
      cancelled = true;
    };
  }, [region]);

  return (
    <section aria-labelledby="admin-title" className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 id="admin-title" className="text-2xl font-semibold text-navy-900">Regional overview</h1>
          <p className="text-sm text-ink-muted">Anonymized aggregates for the last 28 days. No individual is identifiable here.</p>
        </div>
        <label className="text-sm">
          <span className="mb-1 block font-medium text-navy-700">District</span>
          <select value={region} onChange={(e) => setRegion(e.target.value)} className="rounded-xl border-2 border-ice-300 bg-white px-3 py-2 capitalize">
            {REGIONS.map((r) => (
              <option key={r} value={r}>{r}</option>
            ))}
          </select>
        </label>
      </header>

      {error && <p role="alert" className="rounded-xl bg-elevated-100 p-3 text-sm text-elevated-700">Couldn't load: {error}</p>}
      {!agg && !error && <p className="text-ink-muted">Loading…</p>}

      {agg?.suppressed && (
        <p className="flex items-center gap-3 rounded-2xl bg-ice-50 p-4 text-navy-700">
          <IconBadge icon={FiEyeOff} tone="ice" />
          Fewer than five people have checked in from this district, so figures are hidden to protect their privacy.
        </p>
      )}

      {agg && !agg.suppressed && (
        <>
          <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Stat icon={FiUsers} label="People checking in" value={agg.cohortSize ?? 0} />
            <Stat icon={FiCheckCircle} label="Check-ins" value={agg.checkInCount ?? 0} />
            <Stat icon={FiAlertOctagon} tone="urgent" label="Urgent alerts" value={agg.alerts?.urgent ?? 0} />
            <Stat icon={FiAlertTriangle} tone="elevated" label="Elevated alerts" value={agg.alerts?.elevated ?? 0} />
          </dl>
          <p className="text-sm text-ink-muted">
            Alerts acknowledged within 24 hours:{' '}
            <strong className="text-navy-900">{agg.alerts?.acknowledgedWithin24hPct == null ? 'no alerts yet' : `${agg.alerts.acknowledgedWithin24hPct}%`}</strong>
          </p>
          <section aria-labelledby="weekly" className="rounded-2xl border border-ice-300 bg-white p-4">
            <h2 id="weekly" className="mb-3 font-semibold text-navy-900">Check-ins per week</h2>
            <div className="h-56" role="img" aria-label={`Weekly check-ins: ${agg.weeklyCheckIns.map((w) => w.count).join(', ')}`}>
              <ResponsiveContainer>
                <BarChart data={agg.weeklyCheckIns}>
                  <CartesianGrid stroke="#e6f2f9" vertical={false} />
                  <XAxis dataKey="weekStart" tickFormatter={(t: number) => new Date(t).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })} tick={{ fontSize: 12, fill: '#4a5568' }} />
                  <YAxis allowDecimals={false} tick={{ fontSize: 12, fill: '#4a5568' }} width={32} />
                  <Tooltip labelFormatter={(t) => `Week of ${new Date(Number(t)).toLocaleDateString('en-IN', { dateStyle: 'medium' })}`} />
                  <Bar dataKey="count" name="Check-ins" fill="#34568b" radius={[6, 6, 0, 0]} animationDuration={400} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </section>
        </>
      )}
    </section>
  );
}

function Stat({ icon, label, value, tone = 'navy' }: { icon: typeof FiUsers; label: string; value: number; tone?: 'navy' | 'urgent' | 'elevated' }) {
  return (
    <div className="flex items-center gap-3 rounded-2xl border border-ice-300 bg-white p-4">
      <IconBadge icon={icon} tone={tone} />
      <div>
        <dt className="text-sm text-ink-muted">{label}</dt>
        <dd className="text-2xl font-semibold text-navy-900">{value}</dd>
      </div>
    </div>
  );
}
