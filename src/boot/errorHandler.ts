import { defineBoot } from '#q-app';
import { useUiStore } from '@/stores/uiStore';
import { installGlobalErrorHandler } from '@/utils/errorHandling';

/**
 * Connects the global error pipeline to the UI and installs handlers for
 * Vue errors, window errors, and unhandled promise rejections.
 */
export default defineBoot(({ app }) => {
  installGlobalErrorHandler(app, {
    onReport: (report): void => {
      try {
        useUiStore().reportError(report.error, report.retry);
      } catch {
        // Pinia may not be ready during startup; the error is already logged.
      }
    },
  });
});
