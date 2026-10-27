import { acceptHMRUpdate, defineStore } from 'pinia';
import { computed, watch } from 'vue';
import { Dark, Notify } from 'quasar';
import { z } from 'zod';
import { useLocalStorage } from '@/composables/useLocalStorage';
import { isRetryable, toUserMessage, type RetryAction } from '@/utils/errorHandling';
import type { AppError, NotificationTone, ThemeMode } from '@/types';

const themeSchema: z.ZodType<ThemeMode> = z.enum(['light', 'dark']);
const drawerSchema: z.ZodType<boolean> = z.boolean();

export const useUiStore = defineStore('ui', () => {
  const theme = useLocalStorage<ThemeMode>('ui-theme', 'light', themeSchema);
  const drawerOpen = useLocalStorage<boolean>('ui-drawer', false, drawerSchema);
  let dismissActiveNotification: ReturnType<typeof Notify.create> | null = null;

  const themeMode = computed((): ThemeMode => theme.value);
  const isDark = computed((): boolean => theme.value === 'dark');
  const isDrawerOpen = computed((): boolean => drawerOpen.value);

  watch(
    theme,
    (mode): void => {
      Dark.set(mode === 'dark');

      // Quasar does not manage the CSS color-scheme. Without this, a browser
      // whose OS prefers dark colors keeps white default text even after the
      // user switches the app to the light theme.
      if (typeof document !== 'undefined') {
        document.documentElement.style.colorScheme = mode;
      }
    },
    { immediate: true },
  );

  function setTheme(mode: ThemeMode): void {
    theme.value = mode;
  }

  function toggleTheme(): void {
    theme.value = theme.value === 'dark' ? 'light' : 'dark';
  }

  function setDrawerOpen(open: boolean): void {
    drawerOpen.value = open;
  }

  function toggleDrawer(): void {
    drawerOpen.value = !drawerOpen.value;
  }

  function notify(message: string, tone: NotificationTone): void {
    dismissActiveNotification?.();
    dismissActiveNotification = Notify.create({
      message,
      color: tone,
      textColor: 'white',
      position: 'bottom-right',
      timeout: 1000,
      group: false,
    });
  }

  /**
   * Shows an already normalized error with an optional retry action.
   * Validation errors are rendered under the fields, so they are skipped here.
   */
  function reportError(error: AppError, retry?: RetryAction): void {
    if (error.kind === 'validation') {
      return;
    }

    const actions =
      retry && isRetryable(error)
        ? [
            {
              label: 'Повторить',
              color: 'white',
              handler: (): void => {
                void retry();
              },
            },
          ]
        : undefined;

    dismissActiveNotification?.();
    dismissActiveNotification = Notify.create({
      message: toUserMessage(error),
      color: 'negative',
      textColor: 'white',
      position: 'bottom-right',
      timeout: 4000,
      group: false,
      ...(actions ? { actions } : {}),
    });
  }

  return {
    theme,
    drawerOpen,
    themeMode,
    isDark,
    isDrawerOpen,
    setTheme,
    toggleTheme,
    setDrawerOpen,
    toggleDrawer,
    notify,
    reportError,
  };
});

if (import.meta.hot) {
  import.meta.hot.accept(acceptHMRUpdate(useUiStore, import.meta.hot));
}
