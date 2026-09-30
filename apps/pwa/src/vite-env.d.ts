/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_DEMO_VICTIM_ID?: string;
  readonly VITE_DEFAULT_REGION?: string;
  readonly VITE_SPEECH_PROXY_URL?: string;
  readonly VITE_DEV_GATEWAY?: string;
  /** "true" only for the static prototype build (in-browser demo backend). */
  readonly VITE_DEMO_MODE?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
