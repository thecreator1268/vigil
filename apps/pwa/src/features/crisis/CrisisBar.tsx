import { useTranslation } from 'react-i18next';
import { FiLifeBuoy, FiPhone } from 'react-icons/fi';
import { Link } from 'react-router-dom';
import { EMERGENCY_TEL } from './lines';

/**
 * Always-visible crisis entry. Rendered by the root layout on EVERY route —
 * onboarding, check-in, staff dashboards — pinned to the BOTTOM of the
 * screen (never behind navigation, never requiring a scroll up). Two taps,
 * always available: KIRAN and the emergency number. Coral is used for
 * nothing else in this app — see packages/design-system/src/tokens.css.
 */
export function CrisisBar() {
  const { t } = useTranslation();
  return (
    <aside
      aria-label={t('crisis.bar')}
      className="sticky bottom-0 z-40 border-t border-ice-300 bg-panel"
      data-testid="crisis-bar"
    >
      <div className="mx-auto flex max-w-3xl flex-wrap items-center gap-x-3 gap-y-2 px-4 py-2.5 text-sm">
        <span className="font-semibold text-navy-900">{t('crisis.bar')}</span>
        <div className="ml-auto flex items-center gap-2">
          <a
            href="tel:18005990019"
            className="inline-flex min-h-11 items-center gap-1.5 rounded-full bg-ice-strong px-3.5 py-1.5 font-semibold text-on-ice hover:brightness-95"
          >
            <FiPhone aria-hidden /> {t('crisis.barCall')}
          </a>
          <a
            href={EMERGENCY_TEL}
            className="inline-flex min-h-11 items-center gap-1.5 rounded-full bg-coral px-3.5 py-1.5 font-semibold text-on-coral hover:brightness-95"
          >
            <FiPhone aria-hidden /> {t('crisis.emergencyCall')}
          </a>
        </div>
        <Link
          to="/help"
          className="inline-flex items-center gap-1 text-ink-muted underline underline-offset-2 hover:text-navy-900"
        >
          <FiLifeBuoy aria-hidden /> {t('crisis.barMore')}
        </Link>
      </div>
    </aside>
  );
}
