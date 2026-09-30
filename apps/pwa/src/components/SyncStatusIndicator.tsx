import { useMotion } from '@vigil/design-system';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useStore, syncPhase, type SyncPhase } from '../store';

const HOLD_SYNCED_MS = 2_000;

/**
 * Cross-fades: "saved locally" (ice dot) → "syncing" (navy pulse, 1.5s, not a
 * spin) → "synced" (checkmark, holds 2s). The ONLY element in the app allowed
 * continuous animation, and only while actively syncing. Crisis delivery is
 * surfaced distinctly.
 */
export function SyncStatusIndicator() {
  const { t } = useTranslation();
  const sync = useStore((s) => s.sync);
  const reduced = useReducedMotion();
  const fade = useMotion('quick');
  const [justSynced, setJustSynced] = useState(false);

  useEffect(() => {
    if (!sync.lastSyncedAt) return;
    setJustSynced(true);
    const id = setTimeout(() => setJustSynced(false), HOLD_SYNCED_MS);
    return () => clearTimeout(id);
  }, [sync.lastSyncedAt]);

  const phase: SyncPhase = syncPhase(sync, justSynced);
  const label = {
    idle: t('sync.idle'),
    'saved-local': t('sync.savedLocal'),
    syncing: t('sync.syncing'),
    synced: t('sync.synced'),
    'crisis-pending': t('sync.crisisPending'),
  }[phase];

  return (
    <div role="status" aria-live="polite" aria-label={t('sync.label', { status: label })} className="flex items-center text-xs">
      <AnimatePresence mode="wait" initial={false}>
        <motion.span
          key={phase}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={fade}
          className={`inline-flex items-center gap-2 rounded-full px-2.5 py-1 font-medium ${
            phase === 'crisis-pending' ? 'bg-urgent-100 text-urgent-700' : 'bg-ice-50 text-navy-700'
          }`}
          data-phase={phase}
        >
          <Glyph phase={phase} reduced={!!reduced} />
          <span>{label}</span>
        </motion.span>
      </AnimatePresence>
    </div>
  );
}

function Glyph({ phase, reduced }: { phase: SyncPhase; reduced: boolean }) {
  if (phase === 'synced' || phase === 'idle') {
    return (
      <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden>
        <motion.path
          d="M2 6.5 L5 9 L10 3"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          initial={{ pathLength: phase === 'synced' ? 0 : 1 }}
          animate={{ pathLength: 1 }}
          transition={{ duration: reduced ? 0.01 : 0.28 }}
        />
      </svg>
    );
  }
  if (phase === 'syncing' || phase === 'crisis-pending') {
    return (
      <motion.span
        className={`h-2 w-2 rounded-full ${phase === 'crisis-pending' ? 'bg-urgent-700' : 'bg-navy-700'}`}
        animate={reduced ? { opacity: 1 } : { opacity: [1, 0.35, 1] }}
        transition={reduced ? { duration: 0.01 } : { duration: 1.5, repeat: Infinity, ease: 'easeInOut' }}
        aria-hidden
      />
    );
  }
  return <span className="h-2 w-2 rounded-full bg-ice-500" aria-hidden />;
}
