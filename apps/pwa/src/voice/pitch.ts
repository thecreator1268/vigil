/**
 * Pure helpers for voice features — kept separate from the Web Audio / Meyda
 * wiring so they are unit-testable.
 */

/** Autocorrelation pitch estimate (Hz) for one frame, or null if unvoiced. */
export function estimatePitch(frame: Float32Array, sampleRate: number, minHz = 70, maxHz = 400): number | null {
  const minLag = Math.floor(sampleRate / maxHz);
  const maxLag = Math.min(Math.floor(sampleRate / minHz), frame.length - 1);
  let energy = 0;
  for (let i = 0; i < frame.length; i++) energy += (frame[i] as number) ** 2;
  if (energy === 0) return null;

  let bestLag = -1;
  let best = 0;
  for (let lag = minLag; lag <= maxLag; lag++) {
    let sum = 0;
    for (let i = 0; i + lag < frame.length; i++) sum += (frame[i] as number) * (frame[i + lag] as number);
    const r = sum / energy;
    if (r > best) {
      best = r;
      bestLag = lag;
    }
  }
  return best > 0.3 && bestLag > 0 ? sampleRate / bestLag : null;
}

/**
 * Summarise per-frame measurements into the two numbers that ever leave the
 * extractor: coefficient of variation of voiced pitch, and mean voiced RMS.
 * Returns null when there was too little voiced speech to say anything.
 */
export function summariseVoice(frames: { rms: number; pitch: number | null }[], rmsGate = 0.01): { pitchVar: number; rms: number } | null {
  const voiced = frames.filter((f) => f.rms >= rmsGate && f.pitch !== null);
  if (voiced.length < 10) return null;
  const pitches = voiced.map((f) => f.pitch as number);
  const mean = pitches.reduce((a, b) => a + b, 0) / pitches.length;
  const sd = Math.sqrt(pitches.reduce((a, b) => a + (b - mean) ** 2, 0) / pitches.length);
  const rms = voiced.reduce((a, f) => a + f.rms, 0) / voiced.length;
  return { pitchVar: mean > 0 ? sd / mean : 0, rms };
}
