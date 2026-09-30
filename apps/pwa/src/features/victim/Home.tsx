import { IconBadge } from '@vigil/design-system';
import { useLiveQuery } from 'dexie-react-hooks';
import { useTranslation } from 'react-i18next';
import { FiBell, FiCalendar, FiEdit3 } from 'react-icons/fi';
import { tables } from '../../db';
import { relativeDay } from '../../i18n';
import { useTransitionNavigate } from '../../hooks/useTransitionNavigate';
import { useStore } from '../../store';
import { reminderNote } from './Reminders';

export function useVictimId(): string {
  return useStore((s) => s.session.subject) ?? (import.meta.env.VITE_DEMO_VICTIM_ID as string | undefined) ?? 'v_demo_0001';
}

export function Home() {
  const { t } = useTranslation();
  const go = useTransitionNavigate();
  const victimId = useVictimId();
  const level = useStore((s) => s.ui.checkInLevel);
  const last = useLiveQuery(() => tables.checkIns.where('victimId').equals(victimId).reverse().sortBy('createdAt').then((r) => r[0]), [victimId]);
  const upcoming = useLiveQuery(
    () => tables.reminders.where('dueAt').above(Date.now() - 86_400_000).filter((r) => r.victimId === victimId).limit(2).toArray(),
    [victimId],
  );

  return (
    <div className="space-y-8">
      <section className="space-y-4">
        <h1 className="text-2xl font-semibold text-navy-900">{t('home.greeting')}</h1>
        <p className="text-ink-muted">{t('home.sub')}</p>
        <button
          type="button"
          onClick={() => go('/checkin')}
          className="flex w-full items-center justify-center gap-3 rounded-2xl bg-navy-900 px-6 py-5 text-lg font-semibold text-white shadow-sm transition-transform duration-[var(--motion-instant)] hover:bg-navy-700 active:scale-[0.99]"
        >
          <FiEdit3 aria-hidden /> {t('home.cta')}
        </button>
        <p className="text-sm text-ink-muted">
          {last ? t('home.lastCheckIn', { when: relativeDay(last.createdAt) }) : t('home.never')}
        </p>
        <p className="flex items-start gap-3 rounded-2xl bg-ice-50 p-4 text-sm text-navy-700">
          <IconBadge icon={FiBell} tone="navy" size="sm" />
          <span className="pt-1">{level === 'daily' ? t('home.levelDaily') : t('home.levelGentle')}</span>
        </p>
      </section>

      {!!upcoming?.length && (
        <section aria-labelledby="upcoming" className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 id="upcoming" className="font-semibold text-navy-900">{t('home.remindersTitle')}</h2>
            <button type="button" onClick={() => go('/reminders')} className="text-sm text-navy-700 underline underline-offset-2">
              {t('home.seeAll')}
            </button>
          </div>
          <ul className="space-y-2">
            {upcoming.map((r) => (
              <li key={r.id} className="flex items-center gap-3 rounded-2xl border border-ice-300 bg-white p-3">
                <IconBadge icon={FiCalendar} tone="navy" size="sm" />
                <div>
                  <p className="font-medium text-navy-900">{t(`reminders.type.${r.type}`)} · {relativeDay(r.dueAt)}</p>
                  <p className="text-sm text-ink-muted">{reminderNote(r.note, t)}</p>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
