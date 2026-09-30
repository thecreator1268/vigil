import type { SignalName } from '@vigil/shared-types';
import { FiActivity, FiAlertOctagon, FiClock, FiMessageCircle, FiMic } from 'react-icons/fi';
import i18n from '../../i18n';

/** Counselor-facing, collaborative wording: what the person told us, not what we detected. */
export const SIGNAL_COPY: Record<SignalName, { label: string; icon: typeof FiActivity }> = {
  self_report: { label: 'Their own answers', icon: FiActivity },
  sentiment: { label: 'The words they chose', icon: FiMessageCircle },
  engagement: { label: 'Timing of check-ins', icon: FiClock },
  voice: { label: 'How their voice sounded (supporting only)', icon: FiMic },
  crisis_scan: { label: 'Words about safety', icon: FiAlertOctagon },
};

const en = () => i18n.getFixedT('en');

/** "Quite heavy", "Mostly safe" … the person's own answer, in words. */
export function answerInWords(questionId: string, value: number): { question: string; answer: string } {
  const t = en();
  return { question: t(`checkin.q.${questionId}.text`), answer: t(`checkin.q.${questionId}.a${value}`) };
}

export function timeAgo(at: number, now = Date.now()): string {
  const mins = Math.round((now - at) / 60_000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins} min ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs} h ago`;
  return new Date(at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
}
