import { IconBadge } from '@vigil/design-system';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FiEyeOff } from 'react-icons/fi';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
}

/**
 * Intercepts `beforeinstallprompt` to show the device-monitoring/cloud-sync
 * trade-off before the browser's native install UI does. Dismissible, and
 * dismissing never blocks installing — "Install" still calls the deferred
 * native prompt; only our own explanatory banner goes away either way.
 */
export function InstallPrompt() {
  const { t } = useTranslation();
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    const onBeforeInstall = (e: Event) => {
      e.preventDefault();
      setDeferred(e as BeforeInstallPromptEvent);
    };
    window.addEventListener('beforeinstallprompt', onBeforeInstall);
    return () => window.removeEventListener('beforeinstallprompt', onBeforeInstall);
  }, []);

  if (!deferred || dismissed) return null;

  return (
    <section role="region" aria-labelledby="install-notice-title" className="border-b border-ice-300 bg-ice-50 px-4 py-3">
      <div className="mx-auto flex max-w-3xl items-start gap-3">
        <IconBadge icon={FiEyeOff} tone="ice" size="sm" />
        <div className="flex-1 space-y-2">
          <div>
            <h2 id="install-notice-title" className="font-medium text-navy-900">{t('security.installTitle')}</h2>
            <p className="mt-0.5 text-sm text-ink-muted">{t('security.installBody')}</p>
          </div>
          <div className="flex gap-3">
            <button
              type="button"
              onClick={() => {
                setDismissed(true);
                void deferred.prompt();
              }}
              className="rounded-full bg-navy-900 px-4 py-1.5 text-sm font-semibold text-white hover:bg-navy-700"
            >
              {t('security.installProceed')}
            </button>
            <button
              type="button"
              onClick={() => setDismissed(true)}
              className="rounded-full px-4 py-1.5 text-sm font-medium text-navy-700 hover:bg-ice-100"
            >
              {t('security.installDismiss')}
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}
