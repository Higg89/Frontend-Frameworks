import { config, enableAutoUnmount } from '@vue/test-utils';
import { Dark, Notify, Quasar } from 'quasar';
import { afterEach, beforeEach, vi } from 'vitest';

/**
 * Shared environment for every test file:
 * - Quasar is installed globally (components are resolved by @quasar/vite-plugin);
 * - browser APIs missing in jsdom are stubbed;
 * - mounts are destroyed automatically and localStorage never leaks between tests.
 */
config.global.plugins = [
  [
    Quasar,
    {
      plugins: { Dark, Notify },
    },
  ],
];

enableAutoUnmount(afterEach);

if (typeof window !== 'undefined') {
  window.matchMedia ??= ((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: (): void => undefined,
    removeListener: (): void => undefined,
    addEventListener: (): void => undefined,
    removeEventListener: (): void => undefined,
    dispatchEvent: (): boolean => false,
  })) as typeof window.matchMedia;

  window.scrollTo ??= ((): void => undefined) as typeof window.scrollTo;

  globalThis.ResizeObserver ??= class {
    observe = (): void => undefined;
    unobserve = (): void => undefined;
    disconnect = (): void => undefined;
  } as unknown as typeof ResizeObserver;

  globalThis.IntersectionObserver ??= class {
    observe = (): void => undefined;
    unobserve = (): void => undefined;
    disconnect = (): void => undefined;
    takeRecords = (): IntersectionObserverEntry[] => [];
  } as unknown as typeof IntersectionObserver;
}

beforeEach(() => {
  // The error pipeline logs technical details on purpose; tests assert on the
  // resulting AppError / logger entries instead of polluting the report.
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
  localStorage.clear();
  document.body.innerHTML = '';
});

afterEach(() => {
  vi.useRealTimers();
});
