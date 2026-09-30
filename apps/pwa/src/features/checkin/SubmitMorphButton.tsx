import { useMotion } from '@vigil/design-system';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { useTranslation } from 'react-i18next';

/**
 * The submit button morphs into a path-drawing checkmark (~280ms), then the
 * label fades to "Saved on this device." No spinner, ever: a spinner implies
 * waiting on a network the person may not have — and we never do.
 */
export function SubmitMorphButton({ saved, disabled, onClick }: { saved: boolean; disabled?: boolean; onClick: () => void }) {
  const { t } = useTranslation();
  const reduced = useReducedMotion();
  const morph = useMotion('quick');
  const fade = useMotion('standard', { delay: reduced ? 0 : 0.28 });

  return (
    <div className="flex flex-col items-center gap-3">
      <motion.button
        type="button"
        onClick={onClick}
        disabled={disabled || saved}
        layout
        transition={morph}
        aria-label={saved ? t('checkin.saved') : undefined}
        className={`flex h-14 items-center justify-center overflow-hidden bg-navy-900 font-semibold text-white disabled:cursor-default ${
          saved ? 'w-14 rounded-full' : 'w-full rounded-2xl px-6 hover:bg-navy-700'
        }`}
      >
        <AnimatePresence mode="wait" initial={false}>
          {saved ? (
            <motion.svg key="check" width="28" height="28" viewBox="0 0 28 28" aria-hidden>
              <motion.path
                d="M6 14.5 L12 20 L22 8"
                fill="none"
                stroke="currentColor"
                strokeWidth="3"
                strokeLinecap="round"
                strokeLinejoin="round"
                initial={{ pathLength: 0 }}
                animate={{ pathLength: 1 }}
                transition={{ duration: reduced ? 0.01 : 0.28, ease: 'easeOut' }}
              />
            </motion.svg>
          ) : (
            <motion.span key="label" exit={{ opacity: 0 }} transition={{ duration: reduced ? 0.01 : 0.12 }}>
              {t('checkin.submit')}
            </motion.span>
          )}
        </AnimatePresence>
      </motion.button>
      <AnimatePresence>
        {saved && (
          <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={fade} className="text-lg font-semibold text-navy-900" role="status">
            {t('checkin.saved')}
          </motion.p>
        )}
      </AnimatePresence>
    </div>
  );
}
