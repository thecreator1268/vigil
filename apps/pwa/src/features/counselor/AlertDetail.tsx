import { IconBadge, SeverityBadge } from '@vigil/design-system';
import { Alert, type CaseLink, type CheckInSummary, type Reminder, type TrendResponse } from '@vigil/shared-types';
import { useEffect, useRef, useState } from 'react';
import { FiArrowLeft, FiBriefcase, FiCalendar, FiCheck, FiDownload, FiMessageSquare } from 'react-icons/fi';
import { useParams } from 'react-router-dom';
import { api, ensureOk } from '../../api/client';
import { useTransitionNavigate } from '../../hooks/useTransitionNavigate';
import { answerInWords, SIGNAL_COPY, timeAgo } from './copy';
import { TrendChart } from './TrendChart';
import { alertCache, parseAlerts } from './useAlerts';

interface Detail {
  checkIns: CheckInSummary[];
  trend: TrendResponse;
  caseLinks: CaseLink[];
  reminders: Reminder[];
}

const STAGE: Record<CaseLink['stage'], string> = {
  fir_registered: 'FIR registered', investigation: 'Under investigation', chargesheet: 'Chargesheet filed', trial: 'At trial', disposed: 'Disposed',
};
const COMP: Record<CaseLink['compensationStatus'], string> = {
  not_applied: 'Not applied', applied: 'Applied', sanctioned: 'Sanctioned', disbursed: 'Disbursed',
};

export function AlertDetail() {
  const { id = '' } = useParams();
  const go = useTransitionNavigate();
  const [alert, setAlert] = useState<Alert | null>(alertCache.get(id) ?? null);
  const [detail, setDetail] = useState<Detail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const printable = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        let a = alertCache.get(id) ?? null;
        if (!a) {
          const { alerts } = ensureOk(await api.GET('/v1/alerts'));
          a = parseAlerts(alerts).find((x) => x.id === id) ?? null;
        }
        if (!a) throw new Error('This alert no longer exists.');
        if (cancelled) return;
        setAlert(a);
        const path = { params: { path: { id: a.victimId } } };
        const [c, t, k, r] = await Promise.all([
          api.GET('/v1/victims/{id}/checkins', { params: { path: { id: a.victimId }, query: { limit: 10 } } }).then(ensureOk),
          api.GET('/v1/victims/{id}/trend', path).then(ensureOk),
          api.GET('/v1/victims/{id}/case-links', path).then(ensureOk),
          api.GET('/v1/reminders', { params: { query: { victimId: a.victimId } } }).then(ensureOk),
        ]);
        if (!cancelled) setDetail({ checkIns: c.checkIns, trend: t, caseLinks: k.caseLinks, reminders: r.reminders });
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Unable to load');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [id]);

  async function acknowledge() {
    if (!alert) return;
    const updated = Alert.parse(ensureOk(await api.POST('/v1/alerts/{id}/acknowledge', { params: { path: { id: alert.id } } })).alert);
    alertCache.set(updated.id, updated);
    setAlert(updated);
  }

  async function exportPdf() {
    if (!printable.current || !alert) return;
    setExporting(true);
    try {
      const [{ default: html2canvas }, { jsPDF }] = await Promise.all([import('html2canvas'), import('jspdf')]);
      const canvas = await html2canvas(printable.current, { scale: 2, backgroundColor: '#ffffff' });
      const pdf = new jsPDF({ unit: 'pt', format: 'a4' });
      const w = pdf.internal.pageSize.getWidth() - 64;
      pdf.setFontSize(9);
      pdf.text('CONFIDENTIAL — contains sensitive information about a person in care. Do not forward.', 32, 24);
      pdf.addImage(canvas.toDataURL('image/png'), 'PNG', 32, 36, w, (canvas.height * w) / canvas.width);
      pdf.save(`vigil-${alert.victimId}-${new Date().toISOString().slice(0, 10)}.pdf`);
    } finally {
      setExporting(false);
    }
  }

  return (
    <article className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <button type="button" onClick={() => go('/counselor')} className="inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-sm text-navy-700 hover:bg-ice-50">
          <FiArrowLeft aria-hidden /> Back to queue
        </button>
        <div className="flex gap-2">
          <button type="button" onClick={() => void exportPdf()} disabled={!detail || exporting} className="inline-flex items-center gap-2 rounded-full border border-ice-300 px-3 py-1.5 text-sm text-navy-700 hover:bg-ice-50 disabled:opacity-50">
            <FiDownload aria-hidden /> {exporting ? 'Preparing PDF…' : 'Export PDF'}
          </button>
          {alert?.status === 'open' && (
            <button type="button" onClick={() => void acknowledge()} className="inline-flex items-center gap-2 rounded-full bg-navy-900 px-4 py-1.5 text-sm font-semibold text-white hover:bg-navy-700">
              <FiCheck aria-hidden /> Acknowledge
            </button>
          )}
        </div>
      </div>

      {error && <p role="alert" className="rounded-xl bg-elevated-100 p-3 text-elevated-700">{error}</p>}

      <div ref={printable} className="space-y-6 bg-paper">
        {alert && (
          // Shares its view-transition-name with the queue card it morphs from.
          <header className="alert-card-thumb space-y-3 rounded-2xl border border-ice-300 bg-white p-5">
            <div className="flex flex-wrap items-center gap-2">
              <SeverityBadge severity={alert.severity} />
              <h1 className="text-xl font-semibold text-navy-900">{alert.victimId}</h1>
              <span className="text-sm text-ink-muted">· raised {timeAgo(alert.createdAt)}</span>
              {alert.status !== 'open' && (
                <span className="rounded-full bg-sage-100 px-2 py-0.5 text-xs font-medium text-sage-700">
                  Acknowledged{alert.acknowledgedBy ? ` by ${alert.acknowledgedBy}` : ''}
                </span>
              )}
            </div>
            <section aria-labelledby="why">
              <h2 id="why" className="text-sm font-semibold uppercase tracking-wide text-ink-muted">Why this was raised</h2>
              <p className="mt-1 text-ink">{alert.reason_text}</p>
            </section>
            <ul className="flex flex-wrap gap-2" aria-label="What this is based on">
              {alert.signals_involved.map((s) => {
                const c = SIGNAL_COPY[s];
                return (
                  <li key={s} className="inline-flex items-center gap-1.5 rounded-full bg-ice-50 px-2.5 py-1 text-xs text-navy-700">
                    <c.icon aria-hidden /> {c.label}
                  </li>
                );
              })}
            </ul>
            <p className="text-xs text-ink-muted">Scoring config v{alert.configVersion} · {alert.source === 'crisis' ? 'crisis fast-path' : 'trend against their own baseline'}</p>
          </header>
        )}

        {detail && (
          <div className="grid gap-6 lg:grid-cols-5">
            <section aria-labelledby="told" className="space-y-3 lg:col-span-3">
              <h2 id="told" className="flex items-center gap-2 font-semibold text-navy-900">
                <IconBadge icon={FiMessageSquare} size="sm" /> What they told us
              </h2>
              {detail.checkIns.length === 0 && <p className="text-sm text-ink-muted">No check-ins yet.</p>}
              <ol className="space-y-3">
                {detail.checkIns.map((c) => (
                  <li key={c.id} className="rounded-2xl border border-ice-300 bg-white p-4">
                    <p className="text-sm font-medium text-navy-900">
                      {new Date(c.createdAt).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })}
                      <span className="ml-2 text-xs font-normal text-ink-muted">via {c.channel}</span>
                    </p>
                    <dl className="mt-2 grid gap-x-4 gap-y-1 text-sm sm:grid-cols-2">
                      {Object.entries(c.selfReport).map(([q, v]) => {
                        const w = answerInWords(q, v);
                        return (
                          <div key={q}>
                            <dt className="text-ink-muted">{w.question}</dt>
                            <dd className="font-medium text-ink">{w.answer}</dd>
                          </div>
                        );
                      })}
                    </dl>
                    {Object.keys(c.selfReport).length === 0 && <p className="mt-2 text-sm text-ink-muted">They chose to skip the questions this time.</p>}
                    {c.sharedText && (
                      <blockquote className="mt-3 whitespace-pre-wrap rounded-xl bg-ice-50 p-3 text-sm text-ink">“{c.sharedText}”</blockquote>
                    )}
                  </li>
                ))}
              </ol>
            </section>

            <div className="space-y-6 lg:col-span-2">
              <section aria-labelledby="trend-h" className="space-y-2 rounded-2xl border border-ice-300 bg-white p-4">
                <h2 id="trend-h" className="font-semibold text-navy-900">Compared with what's usual for them</h2>
                <TrendChart trend={detail.trend} />
              </section>

              <section aria-labelledby="case-h" className="space-y-2 rounded-2xl border border-ice-300 bg-white p-4">
                <h2 id="case-h" className="flex items-center gap-2 font-semibold text-navy-900">
                  <IconBadge icon={FiBriefcase} size="sm" /> Case
                </h2>
                {detail.caseLinks.length === 0 ? (
                  <p className="text-sm text-ink-muted">No linked case.</p>
                ) : (
                  detail.caseLinks.map((k) => (
                    <dl key={k.id} className="grid grid-cols-2 gap-1 text-sm">
                      <dt className="text-ink-muted">Reference</dt><dd>{k.externalCaseRef}</dd>
                      <dt className="text-ink-muted">Stage</dt><dd>{STAGE[k.stage]}</dd>
                      <dt className="text-ink-muted">Compensation</dt><dd>{COMP[k.compensationStatus]}</dd>
                      <dt className="text-ink-muted">Next hearing</dt>
                      <dd>{k.nextHearingAt ? new Date(k.nextHearingAt).toLocaleDateString('en-IN', { dateStyle: 'medium' }) : '—'}</dd>
                    </dl>
                  ))
                )}
              </section>

              <section aria-labelledby="rem-h" className="space-y-2 rounded-2xl border border-ice-300 bg-white p-4">
                <h2 id="rem-h" className="flex items-center gap-2 font-semibold text-navy-900">
                  <IconBadge icon={FiCalendar} size="sm" /> Reminders
                </h2>
                {detail.reminders.length === 0 ? (
                  <p className="text-sm text-ink-muted">None.</p>
                ) : (
                  <ul className="space-y-1 text-sm">
                    {detail.reminders.map((r) => (
                      <li key={r.id}>
                        <span className="font-medium capitalize">{r.type}</span> · {new Date(r.dueAt).toLocaleDateString('en-IN', { dateStyle: 'medium' })} — {r.note}
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            </div>
          </div>
        )}
        {!detail && !error && <p className="text-ink-muted">Loading what they've shared…</p>}
      </div>
    </article>
  );
}
