import { ConsentScope } from '@vigil/shared-types';
import { useLiveQuery } from 'dexie-react-hooks';
import { useTranslation } from 'react-i18next';
import { tables } from '../../db';
import { relativeDay } from '../../i18n';
import { useStore } from '../../store';
import { syncQueue } from '../../sync/engine';
import { useVictimId } from './Home';

/**
 * "What I've agreed to share" — consent as a living, revisitable ledger, not
 * a sign-up checkbox. Every toggle appends an entry (locally first, synced
 * later); nothing is ever overwritten.
 */
export function Sharing() {
  const { t } = useTranslation();
  const victimId = useVictimId();
  const consent = useStore((s) => s.consent);
  const setConsent = useStore((s) => s.setConsent);
  const history = useLiveQuery(() => tables.consent.where('victimId').equals(victimId).reverse().sortBy('at'), [victimId]);

  async function toggle(scope: ConsentScope, granted: boolean) {
    const at = Date.now();
    const id = crypto.randomUUID();
    await tables.consent.add({ id, victimId, scope, granted, at });
    setConsent(scope, granted, at);
    await syncQueue.enqueue('consent', id);
  }

  return (
    <section aria-labelledby="sharing-title" className="space-y-6">
      <header>
        <h1 id="sharing-title" className="text-2xl font-semibold text-navy-900">{t('sharing.title')}</h1>
        <p className="mt-1 text-ink-muted">{t('sharing.intro')}</p>
      </header>

      <ul className="space-y-3">
        {ConsentScope.options.map((scope) => {
          const on = !!consent[scope]?.granted;
          const id = `consent-${scope}`;
          return (
            <li key={scope} className="flex items-start gap-4 rounded-2xl border border-ice-300 bg-white p-4">
              <div className="flex-1">
                <p id={`${id}-label`} className="font-medium text-navy-900">{t(`sharing.scope.${scope}.title`)}</p>
                <p id={`${id}-desc`} className="mt-0.5 text-sm text-ink-muted">{t(`sharing.scope.${scope}.desc`)}</p>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={on}
                aria-labelledby={`${id}-label`}
                aria-describedby={`${id}-desc`}
                onClick={() => void toggle(scope, !on)}
                className={`relative mt-1 inline-flex h-8 w-14 shrink-0 items-center rounded-full transition-colors duration-[var(--motion-quick)] ${on ? 'bg-sage-700' : 'bg-ink-muted/40'}`}
              >
                <span className={`inline-block h-6 w-6 rounded-full bg-white shadow transition-transform duration-[var(--motion-quick)] ${on ? 'translate-x-7' : 'translate-x-1'}`} />
                <span className="sr-only">{on ? t('sharing.on') : t('sharing.off')}</span>
              </button>
            </li>
          );
        })}
      </ul>

      <section aria-labelledby="history-title" className="space-y-2">
        <h2 id="history-title" className="font-semibold text-navy-900">{t('sharing.history')}</h2>
        {!history?.length ? (
          <p className="text-sm text-ink-muted">{t('sharing.noHistory')}</p>
        ) : (
          <ol className="space-y-1 text-sm">
            {history.map((h) => (
              <li key={h.id} className="flex justify-between gap-2 border-b border-ice-100 py-1.5">
                <span>
                  {h.granted ? t('sharing.turnedOn') : t('sharing.turnedOff')}: {t(`sharing.scope.${h.scope}.title`)}
                </span>
                <time className="text-ink-muted" dateTime={new Date(h.at).toISOString()}>{relativeDay(h.at)}</time>
              </li>
            ))}
          </ol>
        )}
      </section>
    </section>
  );
}
