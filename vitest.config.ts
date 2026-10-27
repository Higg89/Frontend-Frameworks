import { fileURLToPath, URL } from 'node:url';
import { quasar, transformAssetUrls } from '@quasar/vite-plugin';
import vue from '@vitejs/plugin-vue';
import { defineConfig } from 'vitest/config';

const srcDir = fileURLToPath(new URL('./src', import.meta.url));
const sassVariables = fileURLToPath(new URL('./src/css/quasar.variables.scss', import.meta.url));

export default defineConfig({
  plugins: [
    vue({
      template: { transformAssetUrls },
    }),
    quasar({
      sassVariables,
    }),
  ],

  resolve: {
    alias: {
      '@': srcDir,
    },
  },

  test: {
    environment: 'jsdom',
    setupFiles: ['./tests/setup.ts'],
    include: ['tests/**/*.spec.ts'],
    clearMocks: true,
    restoreMocks: true,
    unstubEnvs: true,
    unstubGlobals: true,

    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'lcov', 'json-summary'],
      reportsDirectory: './coverage',
      include: [
        'src/composables/useTodoFilter.ts',
        'src/composables/useValidation.ts',
        'src/utils/validation.ts',
        'src/utils/errorHandling.ts',
        'src/stores/todoStore.ts',
        'src/components/TodoItem.vue',
        'src/components/TodoForm.vue',
        'src/components/TodoList.vue',
      ],
      thresholds: {
        statements: 80,
        branches: 80,
        functions: 80,
        lines: 80,
      },
    },
  },
});
