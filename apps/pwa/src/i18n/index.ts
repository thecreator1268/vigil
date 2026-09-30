import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import en from './en.json';
import hi from './hi.json';

export const LANGUAGES = ['en', 'hi'] as const;
export type Language = (typeof LANGUAGES)[number];

void i18n.use(initReactI18next).init({
  resources: { en: { translation: en }, hi: { translation: hi } },
  lng: 'en',
  fallbackLng: 'en',
  interpolation: { escapeValue: false },
  returnNull: false,
});

export function setLanguage(lng: Language): void {
  void i18n.changeLanguage(lng);
  document.documentElement.lang = lng;
}

/** Relative day label without numbers-as-scores; dates only. */
export function relativeDay(at: number, now = Date.now()): string {
  const DAY = 86_400_000;
  const startOf = (t: number) => new Date(new Date(t).toDateString()).getTime();
  const diff = Math.round((startOf(at) - startOf(now)) / DAY);
  if (Math.abs(now - at) < 60_000) return i18n.t('relative.justNow');
  if (diff === 0) return i18n.t('relative.today');
  if (diff === -1) return i18n.t('relative.yesterday');
  if (diff === 1) return i18n.t('relative.tomorrow');
  return diff < 0 ? i18n.t('relative.daysAgo', { count: -diff }) : i18n.t('relative.inDays', { count: diff });
}

export default i18n;
