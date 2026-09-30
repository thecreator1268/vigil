import { useTranslation } from 'react-i18next';
import { FiLifeBuoy, FiPhone } from 'react-icons/fi';
import { Link } from 'react-router-dom';

/**
 * Always-visible crisis strip. Rendered by the root layout on EVERY route —
 * onboarding, check-in, staff dashboards — and never behind navigation.
 */
export function CrisisBar() {
  const { t } = useTranslation();
  return (
    <aside
      aria-label={t('crisis.bar')}
      className="sticky top-0 z-40 border-b border-navy-700 bg-navy-900 text-white"
      data-testid="crisis-bar"
    >
      <div className="mx-auto flex max-w-3xl flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2 text-sm">
        <span className="font-medium">{t('crisis.bar')}</span>
        <a
          href="tel:18005990019"
          className="inline-flex items-center gap-1.5 rounded-full bg-white px-3 py-1 font-semibold text-navy-900 hover:bg-ice-100"
        >
          <FiPhone aria-hidden /> {t('crisis.barCall')}
        </a>
        <span className="text-ice-300">{t('crisis.barFree')}</span>
        <Link to="/help" className="ml-auto inline-flex items-center gap-1 underline underline-offset-2 hover:text-ice-300">
          <FiLifeBuoy aria-hidden /> {t('crisis.barMore')}
        </Link>
      </div>
    </aside>
  );
}
