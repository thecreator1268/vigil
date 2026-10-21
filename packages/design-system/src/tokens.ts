/**
 * VIGIL design tokens. 2026-10 redesign ("steady"): calm navy/ice palette,
 * coral reserved for urgent/crisis only. See design-system/project/README.md
 * for the full rationale — this file mirrors design-system/project/tokens.json
 * for the parts of the real app that read colours/motion from TS rather than
 * Tailwind classes (SeverityBadge, Framer Motion variants).
 *
 * All text/background pairs below meet WCAG 2.1 AA (≥ 4.5:1).
 */
export const colors = {
  navy900: '#1e2761',
  navy700: '#273072',
  navy500: '#7a88a3',
  ice50: '#eef5fc',
  ice100: '#dcebfb',
  ice300: '#c9d3e0',
  ice500: '#1e2761',
  paper: '#ffffff',
  ink: '#1e2761',
  inkMuted: '#46517a',
  sage700: '#2f6a4d',
  sage100: '#e3f1e9',
  urgent700: '#9c3420',
  urgent100: '#fce8e3',
  elevated700: '#1e2761',
  elevated100: '#b7d3f2',
  // New names (design-system/project/tokens.json), same values as above.
  canvas: '#ffffff',
  panel: '#f5f7fa',
  border: '#c9d3e0',
  borderStrong: '#7a88a3',
  primary: '#1e2761',
  onPrimary: '#ffffff',
  ice: '#dcebfb',
  onIce: '#1e2761',
  iceStrong: '#b7d3f2',
  coral: '#e8735a',
  onCoral: '#1e2761',
  coralTint: '#fce8e3',
  coralInk: '#9c3420',
} as const;

export type MotionTokenName = 'instant' | 'quick' | 'standard' | 'deliberate';

export interface MotionToken {
  /** seconds (Framer Motion units) */
  duration: number;
  ease: 'easeOut' | 'easeInOut' | [number, number, number, number];
  /** CSS equivalent, for view transitions and CSS animations */
  css: string;
}

/** cubic-bezier(.22,.61,.36,1) — arrivals: rows rising, cards arriving. */
const EASE_OUT_ARRIVAL: [number, number, number, number] = [0.22, 0.61, 0.36, 1];
/** cubic-bezier(.45,.05,.25,1) — in-place moves: tab/question/tier swaps. */
const EASE_IN_PLACE: [number, number, number, number] = [0.45, 0.05, 0.25, 1];

/** Shared by Framer Motion AND the View Transitions CSS (see tokens.css). */
export const motionTokens: Record<MotionTokenName, MotionToken> = {
  instant: { duration: 0.16, ease: EASE_OUT_ARRIVAL, css: '160ms cubic-bezier(0.22,0.61,0.36,1)' },
  quick: { duration: 0.32, ease: EASE_IN_PLACE, css: '320ms cubic-bezier(0.45,0.05,0.25,1)' },
  standard: { duration: 0.32, ease: EASE_IN_PLACE, css: '320ms cubic-bezier(0.45,0.05,0.25,1)' },
  deliberate: { duration: 0.52, ease: EASE_OUT_ARRIVAL, css: '520ms cubic-bezier(0.22,0.61,0.36,1)' },
};

/**
 * Under prefers-reduced-motion the duration collapses to ~10ms rather than
 * the animation being removed — the state change must still register.
 */
export const REDUCED_DURATION = 0.01;
