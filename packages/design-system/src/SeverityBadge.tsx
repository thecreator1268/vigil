import { FiAlertOctagon, FiAlertTriangle } from 'react-icons/fi';

export interface SeverityBadgeProps {
  severity: 'urgent' | 'elevated';
}

/**
 * Severity is always icon + text label, never colour alone (WCAG 1.4.1).
 * Copy reads as an instruction, not an alarm (the `severity` value itself
 * is unchanged — "urgent"/"elevated" — only how it's displayed).
 */
export function SeverityBadge({ severity }: SeverityBadgeProps) {
  const urgent = severity === 'urgent';
  const Icon = urgent ? FiAlertOctagon : FiAlertTriangle;
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ${
        urgent ? 'bg-urgent-100 text-urgent-700' : 'bg-elevated-100 text-elevated-700'
      }`}
    >
      <Icon aria-hidden focusable={false} />
      {urgent ? 'Reach out today' : 'Reach out this week'}
    </span>
  );
}
