import { useMotion } from '@vigil/design-system';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { LottieHandle } from 'lottie-react';
import { useStore } from '../../store';
import { useTransitionNavigate } from '../../hooks/useTransitionNavigate';
import { ONBOARDING_ANIMATIONS } from './lottie-glyphs';

// LottieLight: the light player has no expression engine, so no eval() — compatible with a strict CSP.
const Lottie = lazy(() => import('lottie-react').then((m) => ({ default: m.LottieLight })));
const STEPS = ['s1', 's2', 's3', 's4', 's5'] as const;

/**
 * 5-step "how VIGIL works" sequence. Plays once on first launch only; a skip
 * affordance is visible on every step. The Lottie glyph draws once (~600ms)
 * and holds; with reduced motion it jumps straight to the final frame.
 */
export function Onboarding() {
  const { t } = useTranslation();
  const go = useTransitionNavigate();
  const setUi = useStore((s) => s.setUi);
  const reduced = useReducedMotion();
  const [i, setI] = useState(0);
  const lottieRef = useRef<LottieHandle>(null);
  const step = useMotion('deliberate');

  const finish = () => {
    setUi({ onboarded: true });
    go('/');
  };

  useEffect(() => {
    if (reduced) lottieRef.current?.seek(17);
  }, [i, reduced]);

  const key = STEPS[i] as (typeof STEPS)[number];
  const last = i === STEPS.length - 1;

  return (
    <section aria-labelledby="onb-title" className="flex min-h-[60dvh] flex-col">
      <div className="flex justify-end">
        <button type="button" onClick={finish} className="rounded-full px-4 py-2 text-sm font-medium text-navy-700 underline underline-offset-2 hover:bg-ice-50">
          {t('onboarding.skip')}
        </button>
      </div>

      <div className="flex flex-1 flex-col items-center justify-center text-center">
        <AnimatePresence mode="wait" initial={false}>
          <motion.div key={key} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={step} className="space-y-5">
            <div className="mx-auto h-36 w-36" aria-hidden>
              <Suspense fallback={<div className="h-36 w-36 rounded-full bg-ice-100" />}>
                <Lottie lottieRef={lottieRef} src={ONBOARDING_ANIMATIONS[i] as object} loop={false} autoplay={!reduced} className="h-36 w-36" />
              </Suspense>
            </div>
            <p className="text-sm text-ink-muted">{t('onboarding.step', { n: i + 1, total: STEPS.length })}</p>
            <h1 id="onb-title" className="text-2xl font-semibold text-navy-900">{t(`onboarding.${key}.title`)}</h1>
            <p className="mx-auto max-w-sm text-ink-muted">{t(`onboarding.${key}.body`)}</p>
          </motion.div>
        </AnimatePresence>
      </div>

      <div className="mt-8 flex items-center justify-between">
        <ol className="flex gap-2" aria-hidden>
          {STEPS.map((s, idx) => (
            <li key={s} className={`h-2 rounded-full transition-all duration-[var(--motion-quick)] ${idx === i ? 'w-6 bg-navy-900' : 'w-2 bg-ice-300'}`} />
          ))}
        </ol>
        <button
          type="button"
          onClick={() => (last ? finish() : setI(i + 1))}
          className="rounded-2xl bg-navy-900 px-6 py-3 font-semibold text-white hover:bg-navy-700"
        >
          {last ? t('onboarding.start') : t('onboarding.next')}
        </button>
      </div>
    </section>
  );
}
