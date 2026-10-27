/**
 * Types for variables that are read by the build tooling (quasar.config.ts)
 * before the client bundle exists.
 *
 * https://quasar.dev/quasar-cli-vite/handling-import-meta-env#type-inference
 */

declare namespace NodeJS {
  interface ProcessEnv {
    /** Public base path of the SPA, set by the GitHub Pages workflow. */
    readonly VITE_BASE_PATH?: string;
    /** Absolute public URL of the deployed site. */
    readonly VITE_PUBLIC_SITE_URL?: string;
    /** Application name used in index.html. */
    readonly VITE_APP_NAME?: string;
    /** Default meta description used in index.html. */
    readonly VITE_APP_DESCRIPTION?: string;
    /** Open Graph image path used in index.html. */
    readonly VITE_OG_IMAGE?: string;
    /** Enables the in-browser demo API. */
    readonly VITE_USE_MOCK_API?: string;
    /** Enables bundle analysis (rollup-plugin-visualizer). */
    readonly ANALYZE?: string;
  }
}
