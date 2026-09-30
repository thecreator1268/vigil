/**
 * BHASHINI-style speech-to-text adapter with graceful text-only fallback.
 *
 * The endpoint is a server-side PROXY (VITE_SPEECH_PROXY_URL) that holds the
 * BHASHINI/ULCA credentials — API keys never ship in the client bundle. The
 * request/response shape follows BHASHINI's pipeline inference API
 * (pipelineTasks: asr → inputData.audio[].audioContent (base64)).
 *
 * Returns null whenever transcription is unavailable (not configured, offline,
 * slow, or failed) so the UI falls back to text entry — voice features are
 * still extracted on-device either way.
 */
const PROXY = import.meta.env.VITE_SPEECH_PROXY_URL as string | undefined;
const TIMEOUT_MS = 8_000;

export function transcriptionAvailable(): boolean {
  return !!PROXY && navigator.onLine;
}

async function toBase64(blob: Blob): Promise<string> {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

export async function transcribe(audio: Blob, sourceLanguage: 'hi' | 'en'): Promise<string | null> {
  if (!transcriptionAvailable()) return null;
  try {
    const res = await fetch(PROXY as string, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        pipelineTasks: [{ taskType: 'asr', config: { language: { sourceLanguage } } }],
        inputData: { audio: [{ audioContent: await toBase64(audio) }] },
      }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!res.ok) return null;
    const body = (await res.json()) as { pipelineResponse?: { output?: { source?: string }[] }[] };
    const text = body.pipelineResponse?.[0]?.output?.[0]?.source?.trim();
    return text || null;
  } catch {
    return null;
  }
}
