import { IconBadge } from '@vigil/design-system';
import { useTranslation } from 'react-i18next';
import { FiEyeOff } from 'react-icons/fi';

/**
 * Shown once, before onboarding, then never again on this device (see
 * ui.deviceSafetyNoticeSeen). Plain-language trade-offs on device
 * monitoring and cloud sync — this app can't see or control either.
 */
export function DeviceSafetyNotice({ onContinue }: { onContinue: () => void }) {
  const { t } = useTranslation();
  return (
    <section aria-labelledby="safety-title" className="flex min-h-[60dvh] flex-col items-center justify-center gap-6 text-center">
      <IconBadge icon={FiEyeOff} tone="ice" size="lg" />
      <div className="max-w-sm space-y-3">
        <h1 id="safety-title" className="font-serif text-2xl font-semibold text-navy-900">{t('security.noticeTitle')}</h1>
        <p className="text-ink-muted">{t('security.noticeBody1')}</p>
        <p className="text-ink-muted">{t('security.noticeBody2')}</p>
      </div>
      <button type="button" onClick={onContinue} className="rounded-2xl bg-navy-900 px-6 py-3 font-semibold text-white hover:bg-navy-700">
        {t('security.noticeContinue')}
      </button>
    </section>
  );
}
