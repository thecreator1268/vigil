import { IconBadge } from '@vigil/design-system';
import { useLiveQuery } from 'dexie-react-hooks';
import type { TFunction } from 'i18next';
import { useTranslation } from 'react-i18next';
import { FiCalendar, FiDollarSign, FiEdit3 } from 'react-icons/fi';
import { tables } from '../../db';
import { relativeDay } from '../../i18n';
import { useVictimId } from './Home';

const ICON = { hearing: FiCalendar, compensation: FiDollarSign, checkin: FiEdit3 } as const;

/** Local reminders store an i18n key; server ones store text (translated when known). */
export function reminderNote(note: string, t: TFunction): string {
  if (note.startsWith('checkin.reminder.')) return t(note);
  if (note === 'Court hearing date from your case record') return t('reminders.hearingNote');
  return note;
}

export function Reminders() {
  const { t } = useTranslation();
  const victimId = useVictimId();
  const reminders = useLiveQuery(() => tables.reminders.where('victimId').equals(victimId).sortBy('dueAt'), [victimId]);

  return (
    <section aria-labelledby="rem-title" className="space-y-4">
      <h1 id="rem-title" className="text-2xl font-semibold text-navy-900">{t('reminders.title')}</h1>
      {!reminders?.length ? (
        <p className="text-ink-muted">{t('reminders.empty')}</p>
      ) : (
        <ul className="space-y-2">
          {reminders.map((r) => (
            <li key={r.id} className="flex items-center gap-3 rounded-2xl border border-ice-300 bg-white p-4">
              <IconBadge icon={ICON[r.type]} tone="navy" />
              <div>
                <p className="font-medium text-navy-900">
                  {t(`reminders.type.${r.type}`)} · <time dateTime={new Date(r.dueAt).toISOString()}>{relativeDay(r.dueAt)}</time>
                </p>
                <p className="text-sm text-ink-muted">{reminderNote(r.note, t)}</p>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
