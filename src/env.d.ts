/// <reference types="vite/client" />

/**
 * Client-side environment variables.
 *
 * Only variables listed here are allowed in the application code. They are
 * read from .env, .env.development / .env.production and CI environment
 * variables at build time.
 *
 * https://quasar.dev/quasar-cli-vite/handling-import-meta-env#type-inference
 */
interface ImportMetaEnv {
  /** Human-readable application name used in titles and meta tags. */
  readonly VITE_APP_NAME: string;
  /** Default meta description. */
  readonly VITE_APP_DESCRIPTION: string;
  /** Release version reported to the monitoring service. */
  readonly VITE_APP_VERSION: string;
  /** Current environment name: development, production, test. */
  readonly VITE_APP_ENV: string;

  /** Base URL for API requests. */
  readonly VITE_API_BASE_URL: string;

  /** Public base path of the SPA, for example "/" or "/todo-app/". */
  readonly VITE_BASE_PATH: string;
  /** Absolute public site URL used for canonical and Open Graph links. */
  readonly VITE_PUBLIC_SITE_URL: string;
  /** Open Graph image path or absolute URL. */
  readonly VITE_OG_IMAGE: string;

  /** Enables the in-browser demo API (used by the GitHub Pages preview). */
  readonly VITE_USE_MOCK_API: string | boolean;

  /** Enables the monitoring transport. */
  readonly VITE_SENTRY_ENABLED: string | boolean;
  /** Sentry DSN. Public client keys only; never a server secret. */
  readonly VITE_SENTRY_DSN: string;
  /** Environment label reported to Sentry. */
  readonly VITE_SENTRY_ENVIRONMENT: string;
  /** Share of performance transactions to sample, 0..1. */
  readonly VITE_SENTRY_TRACES_SAMPLE_RATE: string | number;
  /** Optional mock/real endpoint that receives monitoring events. */
  readonly VITE_MONITORING_ENDPOINT: string;
  /** Enables anonymous performance analytics. */
  readonly VITE_ANALYTICS_ENABLED: string | boolean;
}
