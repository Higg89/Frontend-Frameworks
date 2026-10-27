import { acceptHMRUpdate, defineStore } from 'pinia';
import { computed, ref } from 'vue';
import { z } from 'zod';
import { useApi } from '@/composables/useApi';
import { useAsync } from '@/composables/useAsync';
import { useLocalStorage } from '@/composables/useLocalStorage';
import { apiFailure, apiSuccess, validateCreateTodo } from '@/services/todoService';
import { useUiStore } from '@/stores/uiStore';
import { useUserStore } from '@/stores/userStore';
import {
  BusinessException,
  isCanceled,
  normalizeError,
  reportError,
  type RetryAction,
} from '@/utils/errorHandling';
import type {
  ApiResult,
  AppError,
  ITodoItem,
  TodoFilterMode,
  TodoFilterOption,
  TodoId,
} from '@/types';

const FILTER_KEY = 'todo-filter';

const filterSchema: z.ZodType<TodoFilterMode> = z.enum(['all', 'active', 'completed']);

const filterOptions: TodoFilterOption[] = [
  { label: 'Все', value: 'all' },
  { label: 'Активные', value: 'active' },
  { label: 'Выполненные', value: 'completed' },
];

const filterModes: readonly TodoFilterMode[] = ['all', 'active', 'completed'];

export const useTodoStore = defineStore('todo', () => {
  const api = useApi();
  // Reloading a list keeps only the latest request, while task mutations
  // must be able to run in parallel without cancelling each other.
  const listState = useAsync();
  const mutationState = useAsync({ cancelPrevious: false });
  const userStore = useUserStore();
  const todos = ref<ITodoItem[]>([]);
  const pendingIds = ref<Set<TodoId>>(new Set());
  const filterMode = useLocalStorage<TodoFilterMode>(FILTER_KEY, 'all', filterSchema);
  const query = ref('');

  const todoItems = computed((): ITodoItem[] => todos.value);
  const activeFilter = computed((): TodoFilterMode => filterMode.value);
  const searchQuery = computed((): string => query.value);
  const isLoading = computed(
    (): boolean => listState.isLoading.value || mutationState.isLoading.value,
  );
  const lastError = computed(
    (): AppError | null => listState.error.value ?? mutationState.error.value,
  );
  const errorMessage = computed((): string => lastError.value?.message ?? '');
  const hasError = computed((): boolean => lastError.value !== null);

  const filteredTodos = computed((): ITodoItem[] => {
    const normalizedQuery = query.value.trim().toLowerCase();

    return todos.value.filter((todo) => {
      const matchesStatus = matchesFilter(todo, filterMode.value);
      const matchesQuery =
        normalizedQuery.length === 0 || todo.title.toLowerCase().includes(normalizedQuery);

      return matchesStatus && matchesQuery;
    });
  });

  const emptyMessage = computed((): string => {
    if (query.value.trim().length > 0) {
      return 'Ничего не найдено';
    }

    if (filterMode.value === 'active') {
      return 'Нет активных задач';
    }

    if (filterMode.value === 'completed') {
      return 'Нет выполненных задач';
    }

    return 'Список задач пуст';
  });

  /**
   * Loads task list from the API. Cached GET responses are reused unless
   * `force` is set, which is used by the explicit refresh/retry actions.
   */
  async function loadTodos(force = false): Promise<ApiResult<ITodoItem[]>> {
    const currentUser = userStore.currentUser;

    if (!currentUser) {
      todos.value = [];
      return apiFailure({ kind: 'network', message: 'Нужно войти' });
    }

    mutationState.setError(null);

    const result = await listState.run((signal) =>
      api.todos.list(currentUser.id, signal, { skipCache: force }),
    );

    if (result.ok) {
      todos.value = result.data;
      return result;
    }

    reportFailure(result.error, () => reloadTodos());
    return result;
  }

  /** Reloads the list from the server, ignoring the short-lived cache. */
  function reloadTodos(): Promise<ApiResult<ITodoItem[]>> {
    return loadTodos(true);
  }

  /**
   * Loads the list only when nothing is in flight.
   * Used when the task page mounts: a fresh cached response is reused,
   * while a request started by login is not aborted by a duplicate call.
   */
  function syncTodos(): void {
    if (!userStore.currentUser || listState.isLoading.value) {
      return;
    }

    void loadTodos();
  }

  function clearTodos(): void {
    listState.cancel();
    mutationState.cancel();
    mutationState.setError(null);
    pendingIds.value.clear();
    todos.value = [];
  }

  async function addTodo(title: string): Promise<ApiResult<ITodoItem>> {
    const currentUser = userStore.currentUser;
    const validated = validateCreateTodo({ title });

    if (!currentUser) {
      const error = apiFailure(
        normalizeError(new BusinessException('Нужно войти в аккаунт', { code: 'auth-required' })),
      );
      mutationState.setError(error.error);
      reportFailure(error.error);
      return error;
    }

    if (!validated.ok) {
      mutationState.setError(validated.error);
      reportFailure(validated.error);
      return validated;
    }

    const result = await mutationState.run((signal) =>
      api.todos.create(
        {
          title: validated.data,
          completed: false,
          createdAt: new Date().toISOString(),
          userId: currentUser.id,
          tagId: 1,
        },
        signal,
      ),
    );

    if (result.ok) {
      todos.value.push(result.data);
      useUiStore().notify('Задача добавлена', 'positive');
      return result;
    }

    reportFailure(result.error, () => addTodo(title));
    return result;
  }

  async function toggleTodo(id: TodoId): Promise<ApiResult<ITodoItem>> {
    const currentUser = userStore.currentUser;
    const current = todos.value.find((item) => item.id === id);

    if (!currentUser || !current) {
      const error = apiFailure({
        kind: 'not_found',
        id,
        message: 'Задача не найдена',
      });
      mutationState.setError(error.error);
      reportFailure(error.error);
      return error;
    }

    if (pendingIds.value.has(id)) {
      return apiSuccess(current);
    }

    pendingIds.value.add(id);

    try {
      const result = await mutationState.run((signal) =>
        api.todos.update(id, { completed: !current.completed }, signal),
      );

      if (!result.ok) {
        reportFailure(result.error, () => toggleTodo(id));
        return result;
      }

      const index = todos.value.findIndex((item) => item.id === id);

      if (index >= 0) {
        todos.value[index] = result.data;
      }

      return result;
    } finally {
      pendingIds.value.delete(id);
    }
  }

  async function deleteTodo(id: TodoId): Promise<ApiResult<TodoId>> {
    const currentUser = userStore.currentUser;

    if (!currentUser) {
      const error = apiFailure(
        normalizeError(new BusinessException('Нужно войти в аккаунт', { code: 'auth-required' })),
      );
      mutationState.setError(error.error);
      reportFailure(error.error);
      return error;
    }

    if (pendingIds.value.has(id)) {
      return apiSuccess(id);
    }

    pendingIds.value.add(id);

    try {
      const result = await mutationState.run((signal) => api.todos.remove(id, signal));

      if (!result.ok) {
        reportFailure(result.error, () => deleteTodo(id));
        return result;
      }

      todos.value = todos.value.filter((item) => item.id !== id);
      useUiStore().notify('Задача удалена', 'info');
      return apiSuccess(id);
    } finally {
      pendingIds.value.delete(id);
    }
  }

  function isPending(id: TodoId): boolean {
    return pendingIds.value.has(id);
  }

  function setFilter(value: string | number | null): void {
    if (isTodoFilterMode(value)) {
      filterMode.value = value;
    }
  }

  function setQuery(value: string | number | null): void {
    query.value = value === null ? '' : String(value);
  }

  if (userStore.isAuthenticated) {
    void loadTodos();
  }

  return {
    todos,
    filterMode,
    query,
    pendingIds,
    loading: isLoading,
    lastError,
    errorMessage,
    hasError,
    todoItems,
    filteredTodos,
    activeFilter,
    searchQuery,
    emptyMessage,
    isLoading,
    filterOptions,
    addTodo,
    toggleTodo,
    deleteTodo,
    loadTodos,
    reloadTodos,
    syncTodos,
    clearTodos,
    isPending,
    setFilter,
    setQuery,
  };
});

function matchesFilter(todo: ITodoItem, mode: TodoFilterMode): boolean {
  if (mode === 'active') {
    return !todo.completed;
  }

  if (mode === 'completed') {
    return todo.completed;
  }

  return true;
}

function isTodoFilterMode(value: string | number | null): value is TodoFilterMode {
  return typeof value === 'string' && filterModes.some((mode) => mode === value);
}

function reportFailure(error: AppError, retry?: RetryAction): void {
  if (isCanceled(error)) {
    return;
  }

  reportError(error, {
    context: 'todo',
    ...(retry ? { retry } : {}),
  });
}

if (import.meta.hot) {
  import.meta.hot.accept(acceptHMRUpdate(useTodoStore, import.meta.hot));
}
