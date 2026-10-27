import { computed, type ComputedRef } from 'vue';
import { useTodoStore } from '@/stores/todoStore';
import type { ITodoItem, TodoFilterMode, TodoFilterOption, TodoId } from '@/types';

export type { TodoFilterMode, TodoFilterOption } from '@/types';

export interface TodoFilterApi {
  filter: ComputedRef<TodoFilterMode>;
  query: ComputedRef<string>;
  filterOptions: TodoFilterOption[];
  filteredTodos: ComputedRef<ITodoItem[]>;
  emptyMessage: ComputedRef<string>;
  isLoading: ComputedRef<boolean>;
  errorMessage: ComputedRef<string>;
  hasError: ComputedRef<boolean>;
  pendingIds: ComputedRef<ReadonlySet<TodoId>>;
  reload: () => Promise<void>;
  setQuery: (value: string | number | null) => void;
  setFilter: (value: string | number | null) => void;
}

/**
 * Reads task filters from the Pinia store.
 * The composable does not keep its own copy of that state.
 */
export function useTodoFilter(): TodoFilterApi {
  const store = useTodoStore();

  return {
    filter: computed((): TodoFilterMode => store.activeFilter),
    query: computed((): string => store.searchQuery),
    filterOptions: store.filterOptions,
    filteredTodos: computed((): ITodoItem[] => store.filteredTodos),
    emptyMessage: computed((): string => store.emptyMessage),
    isLoading: computed((): boolean => store.isLoading),
    errorMessage: computed((): string => store.errorMessage),
    hasError: computed((): boolean => store.hasError),
    pendingIds: computed((): ReadonlySet<TodoId> => store.pendingIds),
    reload: async (): Promise<void> => {
      await store.reloadTodos();
    },
    setQuery: (value): void => {
      store.setQuery(value);
    },
    setFilter: (value): void => {
      store.setFilter(value);
    },
  };
}
