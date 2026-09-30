import { alertQueueVariants, IconBadge, SeverityBadge, navigateWithTransition } from '@vigil/design-system';
import type { Alert } from '@vigil/shared-types';
import { AnimatePresence, motion, useReducedMotion, type PanInfo } from 'framer-motion';
import { useState } from 'react';
import { flushSync } from 'react-dom';
import { FiCheck, FiChevronRight, FiInbox, FiRefreshCw } from 'react-icons/fi';
import { useNavigate } from 'react-router-dom';
import { SIGNAL_COPY, timeAgo } from './copy';
import { useOpenAlerts } from './useAlerts';

const ACK_DRAG_PX = 120;

export function AlertQueue() {
  const { alerts, error, fetchedAt, refresh, acknowledge } = useOpenAlerts();
  const reduced = useReducedMotion();
  const v = alertQueueVariants(reduced);
  const navigate = useNavigate();
  const [morphing, setMorphing] = useState<string | null>(null);

  /** Queue card → detail: native View Transitions shared-element morph. */
  function open(a: Alert) {
    // Exactly one element may carry the shared view-transition-name.
    flushSync(() => setMorphing(a.id));
    navigateWithTransition(`/counselor/alerts/${a.id}`, (to) => navigate(to));
  }

  return (
    <section aria-labelledby="queue-title" className="space-y-4">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 id="queue-title" className="text-2xl font-semibold text-navy-900">Needs attention</h1>
          <p className="text-sm text-ink-muted">
            Urgent first. Drag a card right or press “Acknowledge” once you've reached out.
          </p>
        </div>
        <button type="button" onClick={() => void refresh()} className="inline-flex items-center gap-2 rounded-full border border-ice-300 px-3 py-1.5 text-sm text-navy-700 hover:bg-ice-50">
          <FiRefreshCw aria-hidden /> Refresh
        </button>
      </header>

      {error && (
        <p role="alert" className="rounded-xl bg-elevated-100 p-3 text-sm text-elevated-700">
          Can't reach the server right now{fetchedAt ? `; showing the list as of ${new Date(fetchedAt).toLocaleTimeString('en-IN')}` : ''}. ({error})
        </p>
      )}

      {alerts === null ? (
        <p className="text-ink-muted">Loading the queue…</p>
      ) : alerts.length === 0 ? (
        <p className="flex items-center gap-3 rounded-2xl bg-sage-100 p-4 text-sage-700">
          <IconBadge icon={FiInbox} tone="sage" /> Nothing needs attention right now.
        </p>
      ) : (
        <motion.ul variants={v.list} initial="hidden" animate="shown" className="space-y-3" aria-label="Open alerts">
          <AnimatePresence initial={true}>
            {alerts.map((a) => (
              <motion.li
                key={a.id}
                layout
                variants={v.item}
                initial="hidden"
                animate="shown"
                exit="exit"
                drag="x"
                dragConstraints={{ left: 0, right: 0 }}
                dragElastic={{ left: 0.05, right: 0.6 }}
                onDragEnd={(_e, info: PanInfo) => {
                  if (info.offset.x > ACK_DRAG_PX) void acknowledge(a.id);
                }}
                className={`overflow-hidden rounded-2xl border bg-white ${a.severity === 'urgent' ? 'border-urgent-700/40' : 'border-ice-300'} ${
                  morphing === a.id ? 'alert-card-thumb' : ''
                }`}
              >
                <div className="flex gap-3 p-4">
                  <div className="min-w-0 flex-1 space-y-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <SeverityBadge severity={a.severity} />
                      <span className="text-sm font-medium text-navy-900">{a.victimId}</span>
                      <span className="text-xs text-ink-muted">· {timeAgo(a.createdAt)}</span>
                    </div>
                    <p className="line-clamp-2 text-sm text-ink">{a.reason_text}</p>
                    <ul className="flex flex-wrap gap-2" aria-label="What this is based on">
                      {a.signals_involved.map((s) => {
                        const c = SIGNAL_COPY[s];
                        return (
                          <li key={s} className="inline-flex items-center gap-1 rounded-full bg-ice-50 px-2 py-0.5 text-xs text-navy-700">
                            <c.icon aria-hidden /> {c.label}
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                  <div className="flex shrink-0 flex-col items-end justify-between gap-2">
                    <button
                      type="button"
                      onClick={() => open(a)}
                      className="inline-flex items-center gap-1 rounded-full px-3 py-1.5 text-sm font-medium text-navy-700 hover:bg-ice-50"
                      aria-label={`Open details for ${a.victimId}`}
                    >
                      Details <FiChevronRight aria-hidden />
                    </button>
                    <button
                      type="button"
                      onClick={() => void acknowledge(a.id)}
                      className="inline-flex items-center gap-1.5 rounded-full bg-navy-900 px-3 py-1.5 text-sm font-semibold text-white hover:bg-navy-700"
                    >
                      <FiCheck aria-hidden /> Acknowledge
                    </button>
                  </div>
                </div>
              </motion.li>
            ))}
          </AnimatePresence>
        </motion.ul>
      )}
    </section>
  );
}
