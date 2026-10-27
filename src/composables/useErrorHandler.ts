import { computed, ref, type ComputedRef, type Ref } from 'vue';
import { isRetryable, reportError, toUserMessage, type RetryAction } from '@/utils/errorHandling';
import type { AppError } from '@/types/api';

export interface UseErrorHandlerOptions {
  /** Default retry action used by the "Повторить" button. */
  retry?: RetryAction;
  /** Prefix for error logs. */
  context?: string;
  /** Pass false when the caller renders the message itself (forms, banners). */
  notify?: boolean;
}

export interface ErrorHandlerApi {
  error: Ref<AppError | null>;
  message: ComputedRef<string>;
  hasError: ComputedRef<boolean>;
  canRetry: ComputedRef<boolean>;
  isRetrying: Ref<boolean>;
  handle: (cause: unknown, overrides?: HandleOverrides) => AppError;
  run: <TResult>(
    task: () => Promise<TResult>,
    overrides?: HandleOverrides,
  ) => Promise<TResult | null>;
  retry: () => Promise<boolean>;
  clear: () => void;
}

export interface HandleOverrides {
  retry?: RetryAction;
  context?: string;
  notify?: boolean;
}

/**
 * Component-level access to the centralized error pipeline.
 * It does not build messages or classify anything: both come from `errorHandling`.
 */
export function useErrorHandler(options: UseErrorHandlerOptions = {}): ErrorHandlerApi {
  const error = ref<AppError | null>(null);
  const isRetrying = ref(false);
  let lastRetry: RetryAction | null = options.retry ?? null;

  const message = computed((): string => (error.value ? toUserMessage(error.value) : ''));

  const hasError = computed((): boolean => error.value !== null);

  const canRetry = computed(
    (): boolean => error.value !== null && isRetryable(error.value) && lastRetry !== null,
  );

  function handle(cause: unknown, overrides: HandleOverrides = {}): AppError {
    const retry = overrides.retry ?? options.retry;
    const notify = overrides.notify ?? options.notify ?? true;
    const normalized = reportError(cause, {
      context: overrides.context ?? options.context ?? 'ui',
      silent: !notify,
      ...(retry ? { retry } : {}),
    });

    error.value = normalized;
    lastRetry = retry ?? null;

    return normalized;
  }

  async function run<TResult>(
    task: () => Promise<TResult>,
    overrides: HandleOverrides = {},
  ): Promise<TResult | null> {
    try {
      return await task();
    } catch (cause) {
      handle(cause, overrides);
      return null;
    }
  }

  async function retry(): Promise<boolean> {
    if (isRetrying.value || lastRetry === null || error.value === null) {
      return false;
    }

    isRetrying.value = true;

    try {
      await lastRetry();
      error.value = null;
      return true;
    } catch (cause) {
      handle(cause);
      return false;
    } finally {
      isRetrying.value = false;
    }
  }

  function clear(): void {
    error.value = null;
    lastRetry = options.retry ?? null;
  }

  return {
    error,
    message,
    hasError,
    canRetry,
    isRetrying,
    handle,
    run,
    retry,
    clear,
  };
}
