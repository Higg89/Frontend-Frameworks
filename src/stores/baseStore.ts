import { ref, type Ref } from 'vue';
import { apiFailure } from '@/services/todoService';
import type { ApiResult, AppError } from '@/types';

/**
 * Shared loading and error state for Pinia setup stores.
 * Actions should change state only through run(), so failures stay in one place.
 */
export class StoreModule {
  readonly loading: Ref<boolean> = ref(false);
  readonly error: Ref<AppError | null> = ref(null);

  clearError(): void {
    this.error.value = null;
  }

  async run<TData>(
    work: () => Promise<ApiResult<TData>> | ApiResult<TData>,
  ): Promise<ApiResult<TData>> {
    this.loading.value = true;
    this.error.value = null;

    try {
      const result = await work();

      if (!result.ok) {
        this.error.value = result.error;
      }

      return result;
    } catch {
      const error: AppError = {
        kind: 'storage',
        message: 'Не удалось выполнить операцию',
      };
      this.error.value = error;
      return apiFailure(error);
    } finally {
      this.loading.value = false;
    }
  }
}
