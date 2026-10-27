import { ref, watch, type Ref } from 'vue';
import type { ZodType } from 'zod';

function canUseStorage(): boolean {
  return typeof localStorage !== 'undefined';
}

/**
 * Keeps a reactive value in localStorage.
 * Stored JSON is accepted only when it matches the schema.
 * The watcher lives with the caller scope and stops when that scope is disposed.
 */
export function useLocalStorage<T>(key: string, defaultValue: T, schema: ZodType<T>): Ref<T> {
  const stored = ref(readStoredValue(key, defaultValue, schema)) as Ref<T>;

  watch(
    stored,
    (value): void => {
      if (!canUseStorage()) {
        return;
      }

      localStorage.setItem(key, JSON.stringify(value));
    },
    { deep: true },
  );

  return stored;
}

function readStoredValue<T>(key: string, defaultValue: T, schema: ZodType<T>): T {
  if (!canUseStorage()) {
    return defaultValue;
  }

  const raw = localStorage.getItem(key);

  if (raw === null) {
    return defaultValue;
  }

  try {
    const parsed = schema.safeParse(parseJson(raw));

    if (!parsed.success) {
      return defaultValue;
    }

    return parsed.data;
  } catch {
    return defaultValue;
  }
}

function parseJson(raw: string): string | number | boolean | null | object {
  return JSON.parse(raw) as string | number | boolean | null | object;
}
