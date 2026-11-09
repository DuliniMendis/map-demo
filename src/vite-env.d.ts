/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** "1" lets a production build fall back to the mock nations (until WS3 lands nations.json). */
  readonly VITE_ALLOW_MOCK_DATA?: string;
}
