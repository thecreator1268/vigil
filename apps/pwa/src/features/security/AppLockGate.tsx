import { type FormEvent, type ReactNode, useEffect, useLayoutEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useStore } from '../../store';
import { hashPin } from './pin';

const MAX_ATTEMPTS = 5;
const COOLDOWN_MS = 30_000;

/**
 * Gates victim-facing routes behind the opt-in PIN (off by default — see
 * ui.appLockEnabled). Locks on mount (if already enabled then) and every
 * time the tab regains visibility after being hidden, i.e. "on open/resume"
 * — but NOT the instant someone turns it on from Settings: `locked`'s
 * initial state is captured once, so flipping `enabled` mid-session doesn't
 * boot the person to a PIN screen for the PIN they just set. Never wraps
 * /help: that route is a sibling in App.tsx, outside this gate, so crisis
 * resources stay reachable even while locked.
 *
 * `locked` is mirrored into the store's ephemeral `appLockEngaged` flag via
 * useLayoutEffect (pre-paint, no flash) so other UI — the sync pill — can
 * go silent the instant the lock screen shows, without this component
 * needing to know anything about sync.
 */
export function AppLockGate({ children }: { children: ReactNode }) {
  const enabled = useStore((s) => s.ui.appLockEnabled);
  const setAppLockEngaged = useStore((s) => s.setAppLockEngaged);
  const [locked, setLocked] = useState(enabled);

  useLayoutEffect(() => {
    setAppLockEngaged(locked);
    return () => setAppLockEngaged(false);
  }, [locked, setAppLockEngaged]);

  useEffect(() => {
    if (!enabled) {
      setLocked(false);
      return;
    }
    let wasHidden = false;
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') {
        wasHidden = true;
      } else if (wasHidden) {
        wasHidden = false;
        setLocked(true);
      }
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, [enabled]);

  if (!enabled || !locked) return <>{children}</>;
  return <PinUnlock onUnlock={() => setLocked(false)} />;
}

function PinUnlock({ onUnlock }: { onUnlock: () => void }) {
  const { t } = useTranslation();
  const salt = useStore((s) => s.ui.appLockSalt);
  const expectedHash = useStore((s) => s.ui.appLockPinHash);
  const [pin, setPin] = useState('');
  const [error, setError] = useState<'wrong' | 'cooldown' | null>(null);
  const [attempts, setAttempts] = useState(0);
  const [cooldownUntil, setCooldownUntil] = useState(0);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (Date.now() < cooldownUntil) {
      setError('cooldown');
      return;
    }
    if (!salt || !expectedHash) return;
    const hash = await hashPin(pin, salt);
    if (hash === expectedHash) {
      onUnlock();
      return;
    }
    setPin('');
    const next = attempts + 1;
    if (next >= MAX_ATTEMPTS) {
      setCooldownUntil(Date.now() + COOLDOWN_MS);
      setAttempts(0);
      setError('cooldown');
    } else {
      setAttempts(next);
      setError('wrong');
    }
  }

  return (
    <section aria-labelledby="lock-title" className="flex min-h-[50dvh] flex-col items-center justify-center gap-5 text-center">
      <h1 id="lock-title" className="font-serif text-2xl font-semibold text-navy-900">{t('security.lockTitle')}</h1>
      <p className="max-w-sm text-ink-muted">{t('security.lockBody')}</p>
      <form onSubmit={(e) => void submit(e)} className="flex flex-col items-center gap-3">
        <label className="sr-only" htmlFor="lock-pin">{t('security.pinLabel')}</label>
        <input
          id="lock-pin"
          type="password"
          inputMode="numeric"
          autoComplete="off"
          value={pin}
          onChange={(e) => {
            setPin(e.target.value.replace(/\D/g, '').slice(0, 8));
            setError(null);
          }}
          className="w-40 rounded-2xl border-2 border-ice-300 bg-white px-4 py-3 text-center text-2xl tracking-[6px] focus:border-navy-500"
        />
        {error === 'wrong' && <p role="alert" className="text-sm text-urgent-700">{t('security.pinError')}</p>}
        {error === 'cooldown' && <p role="alert" className="text-sm text-urgent-700">{t('security.cooldown')}</p>}
        <button type="submit" disabled={!pin} className="rounded-2xl bg-navy-900 px-6 py-3 font-semibold text-white hover:bg-navy-700 disabled:opacity-50">
          {t('security.unlock')}
        </button>
      </form>
    </section>
  );
}
