import { useReducedMotion, type Transition } from 'framer-motion';
import { motionTokens, REDUCED_DURATION, type MotionTokenName } from './tokens.js';

/** Framer Motion transition for a token, honouring prefers-reduced-motion. */
export function useMotion(name: MotionTokenName, extra: Transition = {}): Transition {
  const reduced = useReducedMotion();
  const t = motionTokens[name];
  return { duration: reduced ? REDUCED_DURATION : t.duration, ease: t.ease, ...extra };
}

/** Non-hook variant for variants objects. */
export function transitionFor(name: MotionTokenName, reduced: boolean | null, extra: Transition = {}): Transition {
  const t = motionTokens[name];
  return { duration: reduced ? REDUCED_DURATION : t.duration, ease: t.ease, ...extra };
}

/**
 * Alert queue: new alerts slide in top-down (300ms ease-out + shadow lift),
 * 60ms stagger; acknowledged alerts collapse to zero height over 250ms.
 * Framer Motion (not View Transitions) because these must be interruptible.
 */
export function alertQueueVariants(reduced: boolean | null) {
  const d = (s: number) => (reduced ? REDUCED_DURATION : s);
  return {
    list: {
      hidden: {},
      shown: { transition: { staggerChildren: reduced ? 0 : 0.06 } },
    },
    item: {
      hidden: { opacity: 0, y: -14, boxShadow: '0 0 0 rgba(15,31,61,0)' },
      shown: {
        opacity: 1,
        y: 0,
        boxShadow: ['0 12px 28px rgba(15,31,61,0.18)', '0 1px 3px rgba(15,31,61,0.08)'],
        transition: { duration: d(0.3), ease: 'easeOut' as const, boxShadow: { duration: d(0.9), ease: 'easeOut' as const } },
      },
      exit: { opacity: 0, height: 0, marginTop: 0, marginBottom: 0, paddingTop: 0, paddingBottom: 0, transition: { duration: d(0.25) } },
    },
  };
}
