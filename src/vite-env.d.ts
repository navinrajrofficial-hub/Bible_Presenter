/// <reference types="vite/client" />

// Environment variables type definitions
interface ImportMetaEnv {
  readonly VITE_APP_ENV: 'development' | 'staging' | 'production';
  readonly VITE_API_TIMEOUT: string;
  readonly VITE_API_RETRY_ATTEMPTS: string;
  readonly VITE_LAZY_LOAD_DELAY: string;
  readonly VITE_BIBLE_CHUNK_SIZE: string;
  readonly VITE_SONG_CHUNK_SIZE: string;
  readonly VITE_THUMBNAIL_CACHE_SIZE: string;
  readonly VITE_SEARCH_DEBOUNCE_MS: string;
  readonly VITE_MAX_CONCURRENT_RENDERS: string;
  readonly VITE_ENABLE_PWA: string;
  readonly VITE_ENABLE_OFFLINE_MODE: string;
  readonly VITE_ENABLE_VOICE_CONTROL: string;
  readonly VITE_ENABLE_AI_EXTRACTION: string;
  readonly VITE_LOG_LEVEL: 'debug' | 'info' | 'warn' | 'error';
  readonly VITE_ENABLE_REMOTE_LOGGING: string;
  readonly VITE_MAX_LOGS_PER_MINUTE: string;
  readonly VITE_PREFER_INDEXEDDB: string;
  readonly VITE_MAX_STORAGE_SIZE: string;
  readonly VITE_ENABLE_MIGRATION: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

// Global constants defined in vite.config.ts
declare const __APP_VERSION__: string;
declare const __BUILD_TIME__: string;
declare const __DEV__: boolean;
declare const __STAGING__: boolean;
declare const __PROD__: boolean;
