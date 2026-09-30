/**
 * Voice capture. Two independent outputs:
 *   1. prosody features (Meyda RMS + autocorrelation pitch) — computed
 *      on-device, only two summary numbers survive
 *   2. an audio blob — used ONLY for optional transcription, never stored
 */
import { summariseVoice, estimatePitch } from './pitch';

export interface VoiceSession {
  stop(): Promise<{ features: { pitchVar: number; rms: number } | null; audio: Blob | null }>;
}

export async function startVoiceCapture(): Promise<VoiceSession> {
  const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
  const ctx = new AudioContext();
  const source = ctx.createMediaStreamSource(stream);
  const { default: Meyda } = await import('meyda'); // lazy: keep the voice chunk out of first load
  const frames: { rms: number; pitch: number | null }[] = [];

  const analyzer = Meyda.createMeydaAnalyzer({
    audioContext: ctx,
    source,
    bufferSize: 2048,
    featureExtractors: ['rms', 'buffer'],
    callback: (f: { rms?: number; buffer?: Float32Array | number[] }) => {
      const buf = f.buffer instanceof Float32Array ? f.buffer : new Float32Array(f.buffer ?? []);
      frames.push({ rms: f.rms ?? 0, pitch: estimatePitch(buf, ctx.sampleRate) });
    },
  });
  analyzer.start();

  const chunks: Blob[] = [];
  const recorder = typeof MediaRecorder !== 'undefined' ? new MediaRecorder(stream) : null;
  recorder?.addEventListener('dataavailable', (e) => chunks.push(e.data));
  recorder?.start();

  return {
    async stop() {
      analyzer.stop();
      const audio = await new Promise<Blob | null>((resolve) => {
        if (!recorder) return resolve(null);
        recorder.addEventListener('stop', () => resolve(chunks.length ? new Blob(chunks, { type: recorder.mimeType }) : null), { once: true });
        recorder.stop();
      });
      stream.getTracks().forEach((t) => t.stop());
      await ctx.close();
      return { features: summariseVoice(frames), audio };
    },
  };
}
