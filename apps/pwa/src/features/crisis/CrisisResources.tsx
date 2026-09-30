import { IconBadge } from '@vigil/design-system';
import { useTranslation } from 'react-i18next';
import { FiAlertCircle, FiExternalLink, FiHeart, FiPhone, FiShield } from 'react-icons/fi';
import { CRISIS_LINES, EMERGENCY_TEL } from './lines';

const ICONS = { kiran: FiPhone, icall: FiHeart, vandrevala: FiPhone, nhaa: FiShield } as const;

/** The list of lines, reused on the /help page and inline after a crisis-flagged check-in. */
export function CrisisLines({ headingLevel = 2 }: { headingLevel?: 2 | 3 }) {
  const { t } = useTranslation();
  const H = `h${headingLevel}` as const;
  return (
    <ul className="space-y-3" aria-label={t('crisis.title')}>
      {CRISIS_LINES.map((line) => (
        <li key={line.key} className="flex gap-4 rounded-2xl border border-ice-300 bg-white p-4">
          <IconBadge icon={ICONS[line.key]} tone="navy" />
          <div className="min-w-0 flex-1">
            <H className="font-semibold text-navy-900">{t(`crisis.${line.key}.name`)}</H>
            <p className="mt-0.5 text-sm text-ink-muted">{t(`crisis.${line.key}.desc`)}</p>
            {line.tel ? (
              <a
                href={line.tel}
                className="mt-2 inline-flex items-center gap-2 rounded-full bg-navy-900 px-4 py-2 text-sm font-semibold text-white hover:bg-navy-700"
              >
                <FiPhone aria-hidden /> {t('crisis.call')} {t(`crisis.${line.key}.number`)}
              </a>
            ) : (
              <a
                href={line.url}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-2 inline-flex items-center gap-2 rounded-full bg-navy-900 px-4 py-2 text-sm font-semibold text-white hover:bg-navy-700"
              >
                <FiExternalLink aria-hidden /> {t('crisis.visit')} <span className="sr-only">(icallhelpline.org)</span>
              </a>
            )}
          </div>
        </li>
      ))}
    </ul>
  );
}

export function EmergencyNote() {
  const { t } = useTranslation();
  return (
    <p className="flex flex-wrap items-center gap-3 rounded-2xl bg-urgent-100 p-4 text-urgent-700">
      <FiAlertCircle aria-hidden className="shrink-0 text-xl" />
      <span className="flex-1 font-medium">{t('crisis.emergency')}</span>
      <a href={EMERGENCY_TEL} className="rounded-full bg-urgent-700 px-4 py-2 text-sm font-semibold text-white">
        {t('crisis.emergencyCall')}
      </a>
    </p>
  );
}

export function CrisisResources() {
  const { t } = useTranslation();
  return (
    <section aria-labelledby="help-title" className="space-y-5">
      <header>
        <h1 id="help-title" className="text-2xl font-semibold text-navy-900">
          {t('crisis.title')}
        </h1>
        <p className="mt-2 text-ink-muted">{t('crisis.intro')}</p>
      </header>
      <EmergencyNote />
      <CrisisLines />
    </section>
  );
}
