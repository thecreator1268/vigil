import { useLiveQuery } from 'dexie-react-hooks';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FiTrash2 } from 'react-icons/fi';
import { tables, type StoredCheckIn } from '../../db';
import { decryptText } from '../../db/local-crypto';
import { relativeDay } from '../../i18n';
import { syncQueue } from '../../sync/engine';
import { useVictimId } from './Home';

/**
 * Empowerment: the person reviews everything they've checked in with and can
 * erase their own words. Never shows a score — only what they told us.
 */
export function MyEntries() {
  const { t } = useTranslation();
  const victimId = useVictimId();
  const entries = useLiveQuery(() => tables.checkIns.where('victimId').equals(victimId).reverse().sortBy('createdAt'), [victimId]);

  return (
    <section aria-labelledby="entries-title" className="space-y-4">
      <header>
        <h1 id="entries-title" className="text-2xl font-semibold text-navy-900">{t('entries.title')}</h1>
        <p className="mt-1 text-ink-muted">{t('entries.intro')}</p>
      </header>
      {!entries?.length ? (
        <p className="text-ink-muted">{t('entries.empty')}</p>
      ) : (
        <ul className="space-y-3">
          {entries.map((e) => (
            <Entry key={e.id} entry={e} />
          ))}
        </ul>
      )}
    </section>
  );
}

function Entry({ entry }: { entry: StoredCheckIn }) {
  const { t } = useTranslation();
  const [words, setWords] = useState<string | null>(null);
  const [erased, setErased] = useState(false);
  const answered = Object.keys(entry.selfReport).length;

  async function reveal() {
    setWords((await decryptText(entry.freeText)) ?? '');
  }

  async function erase() {
    if (!window.confirm(t('entries.eraseConfirm'))) return;
    await tables.checkIns.update(entry.id, { freeText: undefined });
    // If it may have reached the server, erase it there too (queued; works offline).
    if (entry.syncState !== 'pending') await syncQueue.enqueue('erase-text', entry.id);
    setWords(null);
    setErased(true);
  }

  return (
    <li className="rounded-2xl border border-ice-300 bg-white p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="font-medium text-navy-900">
          <time dateTime={new Date(entry.createdAt).toISOString()}>{relativeDay(entry.createdAt)}</time>
          <span className="ml-2 text-sm font-normal text-ink-muted">· {t('entries.answered', { count: answered })}</span>
        </p>
        <span className="text-xs text-ink-muted">{t(`entries.state.${entry.syncState}`)}</span>
      </div>
      <div className="mt-3 text-sm">
        {entry.freeText ? (
          words === null ? (
            <button type="button" onClick={() => void reveal()} className="text-navy-700 underline underline-offset-2">
              {t('entries.yourWords')}
            </button>
          ) : (
            <div className="space-y-2">
              <p className="text-xs font-medium uppercase tracking-wide text-ink-muted">{t('entries.yourWords')}</p>
              <p className="whitespace-pre-wrap rounded-xl bg-ice-50 p-3 text-ink">{words}</p>
              <button
                type="button"
                onClick={() => void erase()}
                className="inline-flex items-center gap-1.5 rounded-full border border-urgent-700 px-3 py-1.5 text-urgent-700 hover:bg-urgent-100"
              >
                <FiTrash2 aria-hidden /> {t('entries.erase')}
              </button>
            </div>
          )
        ) : (
          <p className="text-ink-muted" role={erased ? 'status' : undefined}>{erased ? t('entries.erased') : t('entries.noWords')}</p>
        )}
      </div>
    </li>
  );
}
