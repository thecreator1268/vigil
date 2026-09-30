import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { FiEdit3, FiHome, FiLifeBuoy, FiList, FiShield, FiWifiOff } from 'react-icons/fi';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { CrisisBar } from '../features/crisis/CrisisBar';
import { setLanguage } from '../i18n';
import { useStore } from '../store';
import { SyncStatusIndicator } from './SyncStatusIndicator';
import { useTransitionNavigate } from '../hooks/useTransitionNavigate';

function LanguageToggle() {
  const { t } = useTranslation();
  const language = useStore((s) => s.ui.language);
  const setUi = useStore((s) => s.setUi);
  return (
    <button
      type="button"
      onClick={() => {
        const next = language === 'en' ? 'hi' : 'en';
        setUi({ language: next });
        setLanguage(next);
      }}
      aria-label={t('common.languageLabel')}
      className="rounded-full border border-ice-300 px-3 py-1 text-xs font-medium text-navy-700 hover:bg-ice-50"
    >
      {t('common.language')}
    </button>
  );
}

function OfflineNotice() {
  const { t } = useTranslation();
  const online = useStore((s) => s.sync.online);
  if (online) return null;
  return (
    <p role="status" className="flex items-center gap-2 bg-ice-100 px-4 py-2 text-sm text-navy-700">
      <FiWifiOff aria-hidden /> {t('common.offline')}
    </p>
  );
}

function NavItem({ to, icon: Icon, label }: { to: string; icon: typeof FiHome; label: string }) {
  const go = useTransitionNavigate();
  const { pathname } = useLocation();
  return (
    <NavLink
      to={to}
      end={to === '/'}
      onClick={(e) => {
        e.preventDefault();
        if (pathname !== to) go(to);
      }}
      className={({ isActive }) =>
        `flex flex-1 flex-col items-center gap-0.5 py-2 text-xs ${isActive ? 'font-semibold text-navy-900' : 'text-ink-muted'}`
      }
    >
      <Icon aria-hidden className="text-lg" />
      {label}
    </NavLink>
  );
}

/** Victim-facing layout: crisis bar, header, content, bottom navigation. */
export function VictimShell() {
  const { t } = useTranslation();
  return (
    <Frame
      nav={
        <nav aria-label={t('nav.main')} className="sticky bottom-0 z-30 border-t border-ice-300 bg-white/95 backdrop-blur">
          <div className="mx-auto flex max-w-3xl">
            <NavItem to="/" icon={FiHome} label={t('nav.home')} />
            <NavItem to="/checkin" icon={FiEdit3} label={t('nav.checkin')} />
            <NavItem to="/entries" icon={FiList} label={t('nav.entries')} />
            <NavItem to="/sharing" icon={FiShield} label={t('nav.sharing')} />
            <NavItem to="/help" icon={FiLifeBuoy} label={t('nav.help')} />
          </div>
        </nav>
      }
    />
  );
}

/** Shared frame: the crisis bar is part of EVERY layout. */
export function Frame({ nav, wide = false, title }: { nav?: ReactNode; wide?: boolean; title?: ReactNode }) {
  const { t } = useTranslation();
  return (
    <div className="flex min-h-dvh flex-col">
      <CrisisBar />
      <header className="border-b border-ice-100 bg-white">
        <div className={`mx-auto flex items-center gap-3 px-4 py-3 ${wide ? 'max-w-6xl' : 'max-w-3xl'}`}>
          <span className="text-lg font-bold tracking-wide text-navy-900">{t('common.appName')}</span>
          {title}
          <div className="ml-auto flex items-center gap-2">
            <SyncStatusIndicator />
            <LanguageToggle />
          </div>
        </div>
      </header>
      <OfflineNotice />
      <main id="main" className={`mx-auto w-full flex-1 px-4 py-6 ${wide ? 'max-w-6xl' : 'max-w-3xl'}`}>
        <Outlet />
      </main>
      {nav}
    </div>
  );
}
