/**
 * VIGIL design tokens. Calm, low-arousal palette: navy for structure, ice for
 * reassurance, warm off-white surfaces. Severity is never conveyed by colour
 * alone — every severity use pairs an icon and a text label.
 *
 * All text/background pairs below meet WCAG 2.1 AA (≥ 4.5:1).
 */
export const colors = {
  navy900: '#0f1f3d',
  navy700: '#1d3461',
  navy500: '#34568b',
  ice50: '#f3f9fc',
  ice100: '#e6f2f9',
  ice300: '#bcdcee',
  ice500: '#5ea9cf',
  paper: '#fbfaf7',
  ink: '#1b2433',
  inkMuted: '#4a5568',
  sage700: '#2f6a4d',
  sage100: '#e3f1e9',
  urgent700: '#9f2a1f',
  urgent100: '#fbe9e6',
  elevated700: '#7a4b00',
  elevated100: '#fff1d6',
} as const;

export type MotionTokenName = 'instant' | 'quick' | 'standard' | 'deliberate';

export interface MotionToken {
  /** seconds (Framer Motion units) */
  duration: number;
  ease: 'easeOut' | 'easeInOut' | [number, number, number, number];
  /** CSS equivalent, for view transitions and CSS animations */
  css: string;
}

const STANDARD_CURVE: [number, number, number, number] = [0.4, 0, 0.2, 1];

/** Shared by Framer Motion AND the View Transitions CSS (see tokens.css). */
export const motionTokens: Record<MotionTokenName, MotionToken> = {
  instant: { duration: 0.12, ease: 'easeOut', css: '120ms ease-out' },
  quick: { duration: 0.22, ease: STANDARD_CURVE, css: '220ms cubic-bezier(0.4,0,0.2,1)' },
  standard: { duration: 0.32, ease: STANDARD_CURVE, css: '320ms cubic-bezier(0.4,0,0.2,1)' },
  deliberate: { duration: 0.5, ease: 'easeInOut', css: '500ms ease-in-out' },
};

/**
 * Under prefers-reduced-motion the duration collapses to ~10ms rather than
 * the animation being removed — the state change must still register.
 */
export const REDUCED_DURATION = 0.01;
