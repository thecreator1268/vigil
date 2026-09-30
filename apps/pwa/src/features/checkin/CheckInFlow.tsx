import { zodResolver } from '@hookform/resolvers/zod';
import { IconBadge, useMotion } from '@vigil/design-system';
import { SELF_REPORT_QUESTIONS } from '@vigil/scoring-engine';
import { CheckInSubmission, SelfReport } from '@vigil/shared-types';
import { AnimatePresence, motion } from 'framer-motion';
import { useEffect, useRef, useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { FiEdit3, FiHardDrive, FiMic, FiMousePointer, FiShield, FiSkipForward, FiUserCheck } from 'react-icons/fi';
import { z } from 'zod';
import { CrisisLines } from '../crisis/CrisisResources';
import { useStore } from '../../store';
import { useTransitionNavigate } from '../../hooks/useTransitionNavigate';
import { SubmitMorphButton } from './SubmitMorphButton';
import { submitCheckIn } from './submit';
import { VoiceCapture } from './VoiceCapture';

/**
 * ONE schema for client and server: the self-report and free-text rules come
 * straight from the shared contract schema the check-in service validates with.
 */
const CheckInForm = z.object({
  selfReport: SelfReport,
  text: CheckInSubmission.shape.freeText,
});
type CheckInFormValues = z.infer<typeof CheckInForm>;

type Step = 'disclosure' | 'questions' | 'words' | 'saved';
type Mode = 'tap' | 'text' | 'voice';

export function CheckInFlow() {
  const { t } = useTranslation();
  const go = useTransitionNavigate();
  const victimId = useStore((s) => s.session.subject) ?? (import.meta.env.VITE_DEMO_VICTIM_ID as string | undefined) ?? 'v_demo_0001';
  const [step, setStep] = useState<Step>('disclosure');
  const [qIndex, setQIndex] = useState(0);
  const [mode, setMode] = useState<Mode>('tap');
  const [voice, setVoice] = useState<{ pitchVar: number; rms: number } | null>(null);
  const [result, setResult] = useState<{ crisis: boolean } | null>(null);
  const startedAt = useRef(Date.now());
  const page = useMotion('quick');

  const form = useForm<CheckInFormValues>({ resolver: zodResolver(CheckInForm), defaultValues: { selfReport: {}, text: '' } });

  const onSubmit = form.handleSubmit(async (values) => {
    const r = await submitCheckIn(
      { selfReport: values.selfReport, text: mode === 'tap' ? undefined : values.text, voiceFeatures: voice, startedAt: startedAt.current },
      victimId,
    );
    setResult({ crisis: r.crisis });
    setStep('saved');
  });

  const question = SELF_REPORT_QUESTIONS[qIndex];
  const total = SELF_REPORT_QUESTIONS.length;
  // Idempotent and tied to the question actually answered: a double tap, or a
  // tap on the question that is animating out, can never skip or stall a step.
  const advanceFrom = (id: string) => setQIndex((i) => (SELF_REPORT_QUESTIONS[i]?.id === id ? i + 1 : i));
  useEffect(() => {
    if (step === 'questions' && qIndex >= total) setStep('words');
  }, [qIndex, step, total]);

  return (
    <form onSubmit={(e) => e.preventDefault()} className="space-y-6" aria-live="polite">
      <AnimatePresence mode="wait" initial={false}>
        {step === 'disclosure' && (
          <motion.section key="disclosure" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={page} aria-labelledby="disc-title" className="space-y-5">
            <h1 id="disc-title" className="text-2xl font-semibold text-navy-900">{t('checkin.disclosureTitle')}</h1>
            <ul className="space-y-3">
              {[
                [FiHardDrive, 'checkin.disclosure1'],
                [FiUserCheck, 'checkin.disclosure2'],
                [FiShield, 'checkin.disclosure3'],
                [FiSkipForward, 'checkin.disclosure4'],
              ].map(([Icon, key]) => (
                <li key={key as string} className="flex items-start gap-3">
                  <IconBadge icon={Icon as typeof FiShield} tone="ice" size="sm" />
                  <span className="pt-1">{t(key as string)}</span>
                </li>
              ))}
            </ul>
            <button type="button" onClick={() => setStep('questions')} className="w-full rounded-2xl bg-navy-900 px-6 py-4 font-semibold text-white hover:bg-navy-700">
              {t('checkin.start')}
            </button>
          </motion.section>
        )}

        {step === 'questions' && question && (
          <motion.section key={`q-${question.id}`} initial={{ opacity: 0, x: 12 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -12, pointerEvents: 'none' }} transition={page} className="space-y-5">
            <p className="text-sm text-ink-muted">{t('checkin.progress', { n: qIndex + 1, total })}</p>
            <Controller
              control={form.control}
              name="selfReport"
              render={({ field }) => (
                <fieldset>
                  <legend className="mb-4 text-xl font-semibold text-navy-900">{t(`checkin.q.${question.id}.text`)}</legend>
                  <div className="grid gap-2">
                    {[0, 1, 2, 3, 4].map((v) => {
                      const checked = field.value[question.id] === v;
                      return (
                        <label
                          key={v}
                          className={`flex cursor-pointer items-center gap-3 rounded-2xl border-2 px-4 py-3 transition-colors duration-[var(--motion-instant)] ${
                            checked ? 'border-navy-900 bg-ice-100' : 'border-ice-300 bg-white hover:border-navy-500'
                          }`}
                        >
                          <input
                            type="radio"
                            name={`q-${question.id}`}
                            value={v}
                            checked={checked}
                            onChange={() => {
                              field.onChange({ ...field.value, [question.id]: v });
                              setTimeout(() => advanceFrom(question.id), 180);
                            }}
                            className="h-5 w-5 accent-navy-900"
                          />
                          <span>{t(`checkin.q.${question.id}.a${v}`)}</span>
                        </label>
                      );
                    })}
                  </div>
                </fieldset>
              )}
            />
            <div className="flex items-center justify-between">
              <button type="button" onClick={() => (qIndex ? setQIndex((i) => Math.max(0, i - 1)) : setStep('disclosure'))} className="rounded-full px-4 py-2 text-navy-700 hover:bg-ice-50">
                {t('common.back')}
              </button>
              {/* Skipping is neutral: no warning, no guilt, and it never lowers any score. */}
              <button
                type="button"
                onClick={() => {
                  const next = { ...form.getValues('selfReport') };
                  delete next[question.id];
                  form.setValue('selfReport', next);
                  advanceFrom(question.id);
                }}
                className="rounded-full px-4 py-2 text-navy-700 underline underline-offset-2 hover:bg-ice-50"
              >
                {t('checkin.skipQuestion')}
              </button>
            </div>
          </motion.section>
        )}

        {step === 'words' && (
          <motion.section key="words" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={page} className="space-y-5">
            <header>
              <h2 className="text-xl font-semibold text-navy-900">{t('checkin.wordsTitle')}</h2>
              <p className="mt-1 text-ink-muted">{t('checkin.wordsSub')}</p>
            </header>
            <div role="radiogroup" aria-label={t('checkin.wordsTitle')} className="grid grid-cols-3 gap-2">
              {([
                ['tap', FiMousePointer, 'checkin.modeTap'],
                ['text', FiEdit3, 'checkin.modeText'],
                ['voice', FiMic, 'checkin.modeVoice'],
              ] as const).map(([m, Icon, key]) => (
                <button
                  key={m}
                  type="button"
                  role="radio"
                  aria-checked={mode === m}
                  onClick={() => setMode(m)}
                  className={`flex flex-col items-center gap-1 rounded-2xl border-2 px-2 py-3 text-sm font-medium ${
                    mode === m ? 'border-navy-900 bg-ice-100 text-navy-900' : 'border-ice-300 bg-white text-ink-muted'
                  }`}
                >
                  <Icon aria-hidden className="text-xl" />
                  {t(key)}
                </button>
              ))}
            </div>

            {mode === 'voice' && <VoiceCapture onFeatures={setVoice} onTranscript={(text) => form.setValue('text', text)} />}
            {(mode === 'text' || (mode === 'voice' && form.watch('text'))) && (
              <label className="block">
                <span className="mb-1 block text-sm font-medium text-navy-700">{t('checkin.textLabel')}</span>
                <textarea
                  {...form.register('text')}
                  rows={5}
                  maxLength={4000}
                  placeholder={t('checkin.textPlaceholder')}
                  className="w-full rounded-2xl border-2 border-ice-300 bg-white p-3 focus:border-navy-500"
                />
              </label>
            )}
          </motion.section>
        )}
      </AnimatePresence>

      {/* Kept mounted across words → saved so the SAME button morphs into the checkmark. */}
      {(step === 'words' || step === 'saved') && (
        <SubmitMorphButton saved={step === 'saved'} onClick={() => void onSubmit()} disabled={form.formState.isSubmitting} />
      )}

      {step === 'saved' && (
          <section className="space-y-6 text-center">
            {result?.crisis ? (
              // Calm and specific — never alarming.
              <div className="space-y-4 text-left">
                <p className="rounded-2xl bg-ice-100 p-4 text-navy-900">{t('crisis.flagged')}</p>
                <p className="text-ink-muted">{t('crisis.flaggedMore')}</p>
                <CrisisLines headingLevel={3} />
              </div>
            ) : (
              <p className="text-ink-muted">{t('checkin.savedSub')}</p>
            )}
            <button type="button" onClick={() => go('/')} className="rounded-full px-5 py-2 font-medium text-navy-700 hover:bg-ice-50">
              {t('checkin.backHome')}
            </button>
          </section>
      )}
    </form>
  );
}
