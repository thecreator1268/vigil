import { type FormEvent, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useStore } from '../../store';
import { hashPin, randomSaltHex } from './pin';
import { wipeDevice } from './wipe';

type Mode = 'idle' | 'setPin' | 'turnOff' | 'wipeConfirm';

/**
 * Device-safety controls. Both App Lock and Quick Wipe are opt-in and off by
 * default; the trade-offs are stated here, not buried in a help page.
 */
export function Settings() {
  const { t } = useTranslation();
  const appLockEnabled = useStore((s) => s.ui.appLockEnabled);
  const [mode, setMode] = useState<Mode>('idle');

  return (
    <section aria-labelledby="settings-title" className="space-y-8">
      <h1 id="settings-title" className="font-serif text-2xl font-semibold text-navy-900">{t('security.settingsTitle')}</h1>

      <section aria-labelledby="applock-title" className="space-y-3 rounded-2xl border border-ice-300 bg-white p-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 id="applock-title" className="font-medium text-navy-900">{t('security.appLockTitle')}</h2>
            <p className="mt-0.5 text-sm text-ink-muted">{t('security.appLockDesc')}</p>
          </div>
          <span className="shrink-0 rounded-full bg-ice-100 px-2.5 py-0.5 text-xs font-semibold text-navy-700">
            {appLockEnabled ? t('security.appLockOn') : t('security.appLockOff')}
          </span>
        </div>

        {mode !== 'setPin' && mode !== 'turnOff' && (
          <button
            type="button"
            onClick={() => setMode(appLockEnabled ? 'turnOff' : 'setPin')}
            className="rounded-full border border-navy-700 px-4 py-2 text-sm font-medium text-navy-700 hover:bg-ice-50"
          >
            {appLockEnabled ? t('security.turnOff') : t('security.turnOn')}
          </button>
        )}
        {mode === 'setPin' && <SetPinForm onDone={() => setMode('idle')} onCancel={() => setMode('idle')} />}
        {mode === 'turnOff' && <TurnOffForm onDone={() => setMode('idle')} onCancel={() => setMode('idle')} />}
      </section>

      <section aria-labelledby="wipe-title" className="space-y-3 rounded-2xl border border-urgent-700/30 bg-white p-4">
        <h2 id="wipe-title" className="font-medium text-navy-900">{t('security.wipeTitle')}</h2>
        <p className="text-sm text-ink-muted">{t('security.wipeDesc')}</p>
        {mode !== 'wipeConfirm' ? (
          <button
            type="button"
            onClick={() => setMode('wipeConfirm')}
            className="rounded-full border border-urgent-700 px-4 py-2 text-sm font-medium text-urgent-700 hover:bg-urgent-100"
          >
            {t('security.wipeButton')}
          </button>
        ) : (
          <WipeConfirmForm onCancel={() => setMode('idle')} />
        )}
      </section>
    </section>
  );
}

function SetPinForm({ onDone, onCancel }: { onDone: () => void; onCancel: () => void }) {
  const { t } = useTranslation();
  const setUi = useStore((s) => s.setUi);
  const [pin, setPin] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<'short' | 'mismatch' | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (pin.length < 4) {
      setError('short');
      return;
    }
    if (pin !== confirm) {
      setError('mismatch');
      return;
    }
    const salt = randomSaltHex();
    const appLockPinHash = await hashPin(pin, salt);
    setUi({ appLockEnabled: true, appLockSalt: salt, appLockPinHash });
    onDone();
  }

  return (
    <form onSubmit={(e) => void submit(e)} className="space-y-3 border-t border-ice-100 pt-3">
      <p className="text-sm text-ink-muted">{t('security.setPinDesc')}</p>
      <label className="block">
        <span className="mb-1 block text-sm font-medium text-navy-700">{t('security.pinLabel')}</span>
        <input
          type="password"
          inputMode="numeric"
          autoComplete="off"
          value={pin}
          onChange={(e) => {
            setPin(e.target.value.replace(/\D/g, '').slice(0, 8));
            setError(null);
          }}
          className="w-full rounded-2xl border-2 border-ice-300 bg-white p-3 focus:border-navy-500"
        />
      </label>
      <label className="block">
        <span className="mb-1 block text-sm font-medium text-navy-700">{t('security.confirmPinLabel')}</span>
        <input
          type="password"
          inputMode="numeric"
          autoComplete="off"
          value={confirm}
          onChange={(e) => {
            setConfirm(e.target.value.replace(/\D/g, '').slice(0, 8));
            setError(null);
          }}
          className="w-full rounded-2xl border-2 border-ice-300 bg-white p-3 focus:border-navy-500"
        />
      </label>
      {error === 'short' && <p role="alert" className="text-sm text-urgent-700">{t('security.pinTooShort')}</p>}
      {error === 'mismatch' && <p role="alert" className="text-sm text-urgent-700">{t('security.pinMismatch')}</p>}
      <div className="flex gap-2">
        <button type="submit" className="rounded-2xl bg-navy-900 px-5 py-2.5 font-semibold text-white hover:bg-navy-700">
          {t('security.save')}
        </button>
        <button type="button" onClick={onCancel} className="rounded-2xl px-5 py-2.5 font-medium text-navy-700 hover:bg-ice-50">
          {t('security.cancel')}
        </button>
      </div>
    </form>
  );
}

function TurnOffForm({ onDone, onCancel }: { onDone: () => void; onCancel: () => void }) {
  const { t } = useTranslation();
  const salt = useStore((s) => s.ui.appLockSalt);
  const expectedHash = useStore((s) => s.ui.appLockPinHash);
  const setUi = useStore((s) => s.setUi);
  const [pin, setPin] = useState('');
  const [error, setError] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!salt || !expectedHash) return;
    const hash = await hashPin(pin, salt);
    if (hash !== expectedHash) {
      setError(true);
      setPin('');
      return;
    }
    setUi({ appLockEnabled: false, appLockSalt: null, appLockPinHash: null });
    onDone();
  }

  return (
    <form onSubmit={(e) => void submit(e)} className="space-y-3 border-t border-ice-100 pt-3">
      <p className="text-sm text-ink-muted">{t('security.turnOffDesc')}</p>
      <label className="block">
        <span className="mb-1 block text-sm font-medium text-navy-700">{t('security.pinLabel')}</span>
        <input
          type="password"
          inputMode="numeric"
          autoComplete="off"
          value={pin}
          onChange={(e) => {
            setPin(e.target.value.replace(/\D/g, '').slice(0, 8));
            setError(false);
          }}
          className="w-full rounded-2xl border-2 border-ice-300 bg-white p-3 focus:border-navy-500"
        />
      </label>
      {error && <p role="alert" className="text-sm text-urgent-700">{t('security.pinError')}</p>}
      <div className="flex gap-2">
        <button type="submit" className="rounded-2xl bg-navy-900 px-5 py-2.5 font-semibold text-white hover:bg-navy-700">
          {t('security.turnOff')}
        </button>
        <button type="button" onClick={onCancel} className="rounded-2xl px-5 py-2.5 font-medium text-navy-700 hover:bg-ice-50">
          {t('security.cancel')}
        </button>
      </div>
    </form>
  );
}

function WipeConfirmForm({ onCancel }: { onCancel: () => void }) {
  const { t } = useTranslation();
  const [text, setText] = useState('');
  const [error, setError] = useState(false);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (text !== 'ERASE') {
      setError(true);
      return;
    }
    setBusy(true);
    await wipeDevice();
  }

  return (
    <form onSubmit={(e) => void submit(e)} className="space-y-3 border-t border-urgent-700/20 pt-3">
      <p className="text-sm font-medium text-urgent-700">{t('security.wipeConfirmTitle')}</p>
      <p className="text-sm text-ink-muted">{t('security.wipeConfirmBody')}</p>
      <label className="block">
        <span className="mb-1 block text-sm font-medium text-navy-700">{t('security.wipeConfirmInputLabel')}</span>
        <input
          type="text"
          autoComplete="off"
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            setError(false);
          }}
          className="w-full rounded-2xl border-2 border-ice-300 bg-white p-3 focus:border-navy-500"
        />
      </label>
      {error && <p role="alert" className="text-sm text-urgent-700">{t('security.wipeWrongConfirm')}</p>}
      <div className="flex gap-2">
        <button type="submit" disabled={busy} className="rounded-2xl bg-urgent-700 px-5 py-2.5 font-semibold text-white hover:brightness-95 disabled:opacity-50">
          {t('security.wipeConfirmButton')}
        </button>
        <button type="button" onClick={onCancel} disabled={busy} className="rounded-2xl px-5 py-2.5 font-medium text-navy-700 hover:bg-ice-50">
          {t('security.wipeCancel')}
        </button>
      </div>
    </form>
  );
}
