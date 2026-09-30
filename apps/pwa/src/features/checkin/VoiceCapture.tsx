import { IconBadge } from '@vigil/design-system';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FiMic, FiSquare } from 'react-icons/fi';
import { hasConsent, useStore } from '../../store';
import { transcribe, transcriptionAvailable } from '../../voice/bhashini';
import type { VoiceSession } from '../../voice/recorder';

type Status = 'idle' | 'recording' | 'done' | 'no-mic';

export function VoiceCapture({
  onFeatures,
  onTranscript,
}: {
  onFeatures: (f: { pitchVar: number; rms: number } | null) => void;
  onTranscript: (text: string) => void;
}) {
  const { t } = useTranslation();
  const language = useStore((s) => s.ui.language);
  const [status, setStatus] = useState<Status>('idle');
  const [session, setSession] = useState<VoiceSession | null>(null);
  const [heard, setHeard] = useState<'transcribed' | 'none' | null>(null);
  const mayTranscribe = hasConsent('voice-transcription');

  async function start() {
    try {
      const { startVoiceCapture } = await import('../../voice/recorder');
      setSession(await startVoiceCapture());
      setStatus('recording');
    } catch {
      setStatus('no-mic');
    }
  }

  async function stop() {
    if (!session) return;
    const { features, audio } = await session.stop();
    setSession(null);
    setStatus('done');
    onFeatures(features);
    // Audio leaves the device ONLY with explicit "voice to text" consent, and
    // is dropped immediately after — it is never stored.
    const text = mayTranscribe && audio && transcriptionAvailable() ? await transcribe(audio, language) : null;
    if (text) onTranscript(text);
    setHeard(text ? 'transcribed' : 'none');
  }

  return (
    <div className="space-y-3 rounded-2xl border border-ice-300 bg-white p-4">
      {!mayTranscribe && <p className="text-sm text-ink-muted">{t('checkin.voiceConsentNeeded')}</p>}
      {status === 'recording' ? (
        <button type="button" onClick={stop} className="flex w-full items-center justify-center gap-2 rounded-2xl bg-urgent-700 px-4 py-3 font-semibold text-white">
          <FiSquare aria-hidden /> {t('checkin.voiceStop')}
        </button>
      ) : (
        <button
          type="button"
          onClick={start}
          disabled={status === 'no-mic'}
          className="flex w-full items-center justify-center gap-2 rounded-2xl bg-navy-900 px-4 py-3 font-semibold text-white disabled:opacity-50"
        >
          <FiMic aria-hidden /> {t('checkin.voiceStart')}
        </button>
      )}
      <div role="status" aria-live="polite" className="text-sm text-ink-muted">
        {status === 'recording' && (
          <span className="flex items-center gap-2">
            <IconBadge icon={FiMic} tone="urgent" size="sm" /> {t('checkin.voiceRecording')}
          </span>
        )}
        {status === 'no-mic' && t('checkin.voiceNoMic')}
        {status === 'done' && (
          <>
            <p>{t('checkin.voiceKept')}</p>
            {heard === 'transcribed' && <p className="mt-1 font-medium text-navy-700">{t('checkin.voiceTranscribed')}</p>}
            {heard === 'none' && mayTranscribe && <p className="mt-1">{t('checkin.voiceNoTranscript')}</p>}
          </>
        )}
      </div>
    </div>
  );
}
