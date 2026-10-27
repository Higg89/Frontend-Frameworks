// Configuration for your app
// https://v2.quasar.dev/quasar-cli-vite/quasar-config-file

import { copyFileSync, existsSync } from 'node:fs';
import { isAbsolute, join } from 'node:path';
import { defineConfig } from '#q-app';
import { visualizer } from 'rollup-plugin-visualizer';
import type { Plugin } from 'vite';

/**
 * Reads a build-time variable. GitHub Actions (and other CI systems) pass
 * values through process.env, while local builds get them from .env files.
 */
function readEnv(name: string, fallback: string): string {
  const fromProcess = process.env[name];

  if (fromProcess !== undefined && fromProcess !== '') {
    return fromProcess;
  }

  const fromDotenv = (import.meta.env as Record<string, string | undefined>)[name];

  return fromDotenv === undefined || fromDotenv === '' ? fallback : fromDotenv;
}

/** Keeps the base path in the shape Vue Router expects: "/" or "/repo/". */
function normalizeBasePath(value: string): string {
  if (value === '' || value === './') {
    return '/';
  }

  const withLeadingSlash = value.startsWith('/') ? value : `/${value}`;

  return withLeadingSlash.endsWith('/') ? withLeadingSlash : `${withLeadingSlash}/`;
}

function normalizeSiteUrl(value: string): string {
  return value.endsWith('/') ? value : `${value}/`;
}

const basePath = normalizeBasePath(readEnv('VITE_BASE_PATH', '/'));
const siteUrl = readEnv('VITE_PUBLIC_SITE_URL', '');
const appName = readEnv('VITE_APP_NAME', 'Todo');
const appDescription = readEnv(
  'VITE_APP_DESCRIPTION',
  'Приложение для управления списком задач: добавление, поиск, фильтрация и настройки.',
);
const ogImagePath = readEnv('VITE_OG_IMAGE', 'icons/favicon-128x128.png');
const ogImage = siteUrl === '' ? ogImagePath : new URL(ogImagePath, normalizeSiteUrl(siteUrl)).href;

const analyzeBundle = process.env.ANALYZE === 'true';

// rollup-plugin-visualizer ships its own Rolldown-compatible types which do not
// line up with the Vite plugin types Quasar expects, so the factory is widened.
const bundleAnalyzer = visualizer as unknown as (options?: unknown) => Plugin;

const bundleAnalyzerEntry: [(options?: unknown) => Plugin, Record<string, unknown>] = [
  bundleAnalyzer,
  {
    filename: 'reports/bundle-stats.html',
    title: 'Todo bundle',
    template: 'treemap',
    gzipSize: true,
    brotliSize: true,
    open: false,
  },
];

export default defineConfig((ctx) => {
  const envFile = `.env.${ctx.dev ? 'development' : 'production'}`;

  return {
    // https://v2.quasar.dev/quasar-cli-vite/prefetch-feature
    // preFetch: true,

    // app boot file (/src/boot)
    // --> boot files are part of "main.js"
    // https://v2.quasar.dev/quasar-cli-vite/boot-files
    boot: ['errorHandler', 'monitoring', 'seo'],

    // https://v2.quasar.dev/quasar-cli-vite/quasar-config-file#css
    css: ['app.scss'],

    // https://github.com/quasarframework/quasar/tree/dev/extras
    extras: [
      // 'ionicons-v4',
      // 'mdi-v7',
      // 'fontawesome-v7',
      // 'eva-icons',
      // 'themify',
      // 'line-awesome',

      'roboto-font', // optional, you are not bound to it
      'material-icons', // optional, you are not bound to it
    ],

    // Values available inside index.html through EJS (<%= appName %>).
    htmlVariables: {
      appName,
      appDescription,
      appImage: ogImage,
      appUrl: siteUrl,
    },

    // https://v2.quasar.dev/quasar-cli-vite/quasar-config-file#build
    build: {
      target: {
        // browser: 'baseline-widely-available',
        // node: 'node22'
      },

      typescript: {
        strict: true,
        vueShim: true,
        // extendTsConfig (tsConfig) {}
      },

      // https://v2.quasar.dev/quasar-cli-vite/page-routing-with-vue-router#filename-based-routing
      // filenameBasedRouting: true,

      // History mode gives every page a real URL (better for SEO). GitHub Pages
      // needs a 404.html fallback, generated in afterBuild below.
      vueRouterMode: 'history',
      // vueRouterBase is derived from publicPath by Quasar CLI.

      // GitHub Pages project sites live under /<repository>/, so the base path
      // is provided by the deploy workflow. Local builds use "/".
      publicPath: basePath,

      // Never publish source maps: they expose the original source code.
      sourcemap: false,

      // Terser is used so that console/debugger statements can be stripped from
      // production bundles. Oxc remains the default for development.
      minify: 'terser',

      // All components use the Composition API, so the Options API runtime can
      // be dropped from the bundle.
      vueOptionsAPI: false,

      // https://v2.quasar.dev/quasar-cli-vite/handling-import-meta-env
      env: {
        // VITE_ keeps the familiar Vite convention; QCLI_ is kept for Quasar.
        clientPrefix: ['VITE_', 'QCLI_'],
        // src/env.d.ts is the single source of truth for the client env types.
        ignoreType: 'all',
        // Load the file for the current environment in addition to .env.
        file: [envFile],
      },

      // https://v2.quasar.dev/quasar-cli-vite/quasar-config-file#htmlvariables
      // (htmlVariables is defined above, at the top level.)

      // https://v2.quasar.dev/quasar-cli-vite/handling-vite#adding-vite-plugins
      vitePlugins: [
        [
          'vite-plugin-checker',
          {
            vueTsc: true,
            eslint: {
              lintCommand: 'eslint -c ./eslint.config.js "./src*/**/*.{ts,js,mjs,cjs,vue}"',
              useFlatConfig: true,
            },
          },
          { server: false },
        ],

        // `npm run build:analyze` enables ANALYZE and produces a treemap report.
        ...(analyzeBundle ? [bundleAnalyzerEntry] : []),
      ],

      extendViteConf(viteConf) {
        viteConf.build ??= {};
        viteConf.build.sourcemap = false;
        viteConf.build.assetsInlineLimit = 4096;
        viteConf.build.chunkSizeWarningLimit = 700;
        viteConf.build.reportCompressedSize = true;
        viteConf.build.terserOptions = {
          compress: {
            drop_console: true,
            drop_debugger: true,
            passes: 2,
          },
          format: {
            comments: false,
          },
        };
      },

      // GitHub Pages serves 404.html for unknown paths. Copying index.html
      // there lets Vue Router handle deep links in history mode.
      afterBuild({ quasarConf }) {
        if (ctx.modeName !== 'spa') {
          return;
        }

        const configuredDist = quasarConf.build?.distDir ?? 'dist/spa';
        const distDir = isAbsolute(configuredDist)
          ? configuredDist
          : ctx.appPaths.resolve.app(configuredDist);
        const indexFile = join(distDir, 'index.html');

        if (existsSync(indexFile)) {
          copyFileSync(indexFile, join(distDir, '404.html'));
        }
      },
    },

    // https://v2.quasar.dev/quasar-cli-vite/quasar-config-file#devserver
    devServer: {
      // vueDevtools: true,
      // https: true,
      open: false,
      port: 9005,
      proxy: {
        '/api': {
          target: 'http://localhost:3002',
          changeOrigin: true,
        },
      },
    },

    // https://v2.quasar.dev/quasar-cli-vite/quasar-config-file#framework
    framework: {
      config: {},

      // iconSet: 'material-icons', // Quasar icon set
      // lang: 'en-US', // Quasar language pack

      // For special cases outside of where the auto-import strategy can have an impact
      // (like functional components as one of the examples),
      // you can manually specify Quasar components/directives to be available everywhere:
      //
      // components: [],
      // directives: [],

      // Quasar plugins
      plugins: ['Dark', 'Notify'],
    },

    // animations: 'all', // --- includes all animations
    // https://v2.quasar.dev/options/animations
    animations: ['fadeIn', 'fadeOut'],

    // https://v2.quasar.dev/quasar-cli-vite/quasar-config-file#sourcefiles
    // sourceFiles: {
    //   rootComponent: 'src/App.vue',
    //   router: 'src/router/index',
    //   store: 'src/store/index',
    //   pwaRegisterServiceWorker: 'src-pwa/register-sw',
    //   pwaServiceWorker: 'src-pwa/sw/custom-sw',
    //   pwaManifestFile: 'src-pwa/manifest.json',
    //   electronMain: 'src-electron/electron-main',
    //   electronPreload: 'src-electron/electron-preload'
    //   bexManifestFile: 'src-bex/manifest.json
    // },

    // https://v2.quasar.dev/quasar-cli-vite/developing-ssr/configuring-ssr
    ssr: {
      /**
       * The default port that the production server should use
       * (gets superseded if process.env.PORT is specified at runtime)
       */
      prodPort: 3000,
      middlewares: [
        'render', // keep this as last one
      ],

      // clientSideRenderingRoutes: [],
      // noPreloadTagRoutes: [],
      // manualStoreSerialization: true,
      // manualStoreSsrContextInjection: true,
      // manualStoreHydration: true,
      // manualPostHydrationTrigger: true,
      // prodScriptNamedExport: false,

      // extendSSRPackageJson (pkgJson) {},
      // extendSSRManifestJson (json) {},
      // extendSSRWebserverConf (rolldownConf) {},

      // pwa: true,
      // pwaOfflineHtmlFilename: 'offline.html', // do NOT use index.html as name!
      // extendSSRGenerateSWOptions (cfg) {},
      // extendSSRInjectManifestOptions (cfg) {},
    },

    // https://v2.quasar.dev/quasar-cli-vite/developing-ssg/configuring-ssg
    ssg: {
      // onSsgRendererError: 'abort',
      // ssgRendererConcurrency: 1,
      // ssgRendererRetryCount: 0,
      // ssgRendererRetryDelay: 1000,
      // ssgRendererDirectoryIndexes: true,
      // error404HtmlFilename: '404.html',
      // clientSideRenderingHtmlFilename: 'csr.html',
      // clientSideRenderingRoutes: [],
      // noPreloadTagRoutes: []
      // extendSSGRendererConf (rolldownConf) {},
      // extendSSGManifestJson (json) {},
      // manualStoreSerialization: true,
      // manualStoreSsrContextInjection: true,
      // manualStoreHydration: true,
      // manualPostHydrationTrigger: true,
      // pwa: true,
      // pwaOfflineHtmlFilename: 'offline.html',
      // extendSSGGenerateSWOptions (cfg) {},
      // extendSSGInjectManifestOptions (cfg) {},
    },

    // https://v2.quasar.dev/quasar-cli-vite/developing-pwa/configuring-pwa
    pwa: {
      workboxMode: 'GenerateSW', // 'GenerateSW' or 'InjectManifest'
      // swFilename: 'sw.js',
      // manifestFilename: 'manifest.json',
      // extendPWAManifestJson (json) {},
      // useCredentialsForManifestTag: true,
      // injectPWAMetaTags: false,
      // extendPWACustomSWConf (rolldownConf) {},
      // extendPWAGenerateSWOptions (cfg) {},
      // extendPWAInjectManifestOptions (cfg) {},
      // extendPWASwTsConfig (tsConfig) {}
    },

    // https://v2.quasar.dev/quasar-cli-vite/developing-cordova-apps/configuring-cordova
    cordova: {},

    // https://v2.quasar.dev/quasar-cli-vite/developing-capacitor-apps/configuring-capacitor
    capacitor: {
      hideSplashscreen: true,
    },

    // https://v2.quasar.dev/quasar-cli-vite/developing-electron-apps/configuring-electron
    electron: {
      // extendElectronMainConf (rolldownConf) {},
      // extendElectronPreloadConf (rolldownConf) {},
      // extendElectronPackageJson (pkgJson) {},

      // Electron preload scripts (if any) from /src-electron, WITHOUT file extension
      preloadScripts: ['electron-preload'],

      // specify the debugging port to use for the Electron app when running in development mode
      inspectPort: 5858,

      bundler: 'packager', // 'packager' or 'builder'

      packager: {
        // https://github.com/electron-userland/electron-packager/blob/master/docs/api.md#options
        // OS X / Mac App Store
        // appBundleId: '',
        // appCategoryType: '',
        // osxSign: '',
        // protocol: 'myapp://path',
        // Windows only
        // win32metadata: { ... }
      },

      builder: {
        // https://www.electron.build/configuration

        appId: 'todo-app',
      },
    },

    // https://v2.quasar.dev/quasar-cli-vite/developing-browser-extensions/configuring-bex
    bex: {
      // extendBexScriptsConf (rolldownConf) {},
      // extendBexManifestJson (json) {},

      /**
       * The list of extra scripts (js/ts) not in your bex manifest that you want to
       * compile and use in your browser extension. Maybe dynamic use them?
       *
       * Each entry in the list should be a relative filename to /src-bex/
       *
       * @example [ 'my-script.ts', 'sub-folder/my-other-script.js' ]
       */
      extraScripts: [],
    },
  };
});
