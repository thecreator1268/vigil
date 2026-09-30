import type { IconType } from 'react-icons';

const TONES = {
  navy: 'bg-ice-100 text-navy-700',
  ice: 'bg-ice-50 text-navy-500',
  sage: 'bg-sage-100 text-sage-700',
  urgent: 'bg-urgent-100 text-urgent-700',
  elevated: 'bg-elevated-100 text-elevated-700',
} as const;

export interface IconBadgeProps {
  icon: IconType;
  tone?: keyof typeof TONES;
  size?: 'sm' | 'md' | 'lg';
  /** Required when the badge conveys meaning on its own; omit when decorative. */
  label?: string;
}

const SIZES = { sm: 'h-8 w-8 text-sm', md: 'h-10 w-10 text-base', lg: 'h-14 w-14 text-2xl' } as const;

/** A Feather icon inside a tinted circle — the house style for every icon. */
export function IconBadge({ icon: Icon, tone = 'navy', size = 'md', label }: IconBadgeProps) {
  return (
    <span
      className={`inline-flex shrink-0 items-center justify-center rounded-full ${TONES[tone]} ${SIZES[size]}`}
      role={label ? 'img' : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
    >
      <Icon aria-hidden focusable={false} />
    </span>
  );
}
