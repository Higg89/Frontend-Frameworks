import { ref, type Ref } from 'vue';
import { CANCELED_MESSAGE } from '@/services/apiClient';
import type { ApiResult, AppError } from '@/types';

export interface UseAsyncOptions {
  /**
   * Abort the previous run when a new one starts.
   * Disable it for independent actions that must not cancel each other.
   */
  cancelPrevious?: boolean;
}

export interface AsyncState {
  data: Ref<unknown>;
  isLoading: Ref<boolean>;
  error: Ref<AppError | null>;
  run: <TData>(
    task: (signal: AbortSignal) => Promise<ApiResult<TData>>,
  ) => Promise<ApiResult<TData>>;
  setError: (error: AppError | null) => void;
  cancel: () => void;
}

/**
 * Tracks loading, errors, and cancellation for async operations.
 * By default only the latest run is relevant (search, reload).
 * With `cancelPrevious: false` several runs can work in parallel
 * while loading and errors are still aggregated.
 */
export function useAsync(options: UseAsyncOptions = {}): AsyncState {
  const cancelPrevious = options.cancelPrevious !== false;
  const data = ref<unknown>(null);
  const isLoading = ref(false);
  const error = ref<AppError | null>(null);
  const controllers = new Set<AbortController>();
  let lastController: AbortController | null = null;
  let currentRun = 0;
  let activeRuns = 0;

  async function run<TData>(
    task: (signal: AbortSignal) => Promise<ApiResult<TData>>,
  ): Promise<ApiResult<TData>> {
    const runId = ++currentRun;
    const controller = new AbortController();

    controllers.add(controller);

    if (cancelPrevious) {
      lastController?.abort();
      lastController = controller;
    }

    activeRuns += 1;
    isLoading.value = true;
    error.value = null;

    try {
      const result = await task(controller.signal);

      if (cancelPrevious && runId !== currentRun) {
        return result;
      }

      if (result.ok) {
        data.value = result.data;
      } else if (result.error.message !== CANCELED_MESSAGE) {
        error.value = result.error;
      }

      return result;
    } finally {
      activeRuns = Math.max(0, activeRuns - 1);
      controllers.delete(controller);

      if (activeRuns === 0) {
        isLoading.value = false;
      }
    }
  }

  function setError(value: AppError | null): void {
    error.value = value;
  }

  function cancel(): void {
    currentRun += 1;
    lastController = null;

    for (const controller of controllers) {
      controller.abort();
    }

    controllers.clear();
    activeRuns = 0;
    isLoading.value = false;
  }

  return { data, isLoading, error, run, setError, cancel };
}
