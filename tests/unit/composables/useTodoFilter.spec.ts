import { nextTick } from 'vue';
import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import { useTodoFilter } from '@/composables/useTodoFilter';
import type { ITodoItem, TodoFilterMode, TodoFilterOption, TodoId } from '@/types';
import { makeTodo } from '../../mocks/api';

interface StoreStub {
  activeFilter: TodoFilterMode;
  searchQuery: string;
  filteredTodos: ITodoItem[];
  filterOptions: TodoFilterOption[];
  emptyMessage: string;
  isLoading: boolean;
  errorMessage: string;
  hasError: boolean;
  pendingIds: Set<TodoId>;
  reloadTodos: Mock;
  setQuery: Mock;
  setFilter: Mock;
}

const holder = vi.hoisted(() => ({
  store: null as StoreStub | null,
  reloadTodos: vi.fn(),
  setQuery: vi.fn(),
  setFilter: vi.fn(),
}));

vi.mock('@/stores/todoStore', async () => {
  const { reactive } = await import('vue');

  const store = reactive<StoreStub>({
    activeFilter: 'all',
    searchQuery: '',
    filteredTodos: [],
    filterOptions: [
      { label: 'Все', value: 'all' },
      { label: 'Активные', value: 'active' },
      { label: 'Выполненные', value: 'completed' },
    ],
    emptyMessage: 'Список задач пуст',
    isLoading: false,
    errorMessage: '',
    hasError: false,
    pendingIds: new Set<TodoId>(),
    reloadTodos: holder.reloadTodos,
    setQuery: holder.setQuery,
    setFilter: holder.setFilter,
  });

  holder.store = store;

  return { useTodoStore: () => store };
});

function store(): StoreStub {
  if (!holder.store) {
    throw new Error('Todo store mock is not initialized');
  }

  return holder.store;
}

beforeEach(() => {
  const current = store();

  current.activeFilter = 'all';
  current.searchQuery = '';
  current.filteredTodos = [];
  current.emptyMessage = 'Список задач пуст';
  current.isLoading = false;
  current.errorMessage = '';
  current.hasError = false;
  current.pendingIds = new Set<TodoId>();
});

describe('useTodoFilter', () => {
  it('exposes the current store state as computed values', () => {
    const todo = makeTodo();
    const current = store();

    current.activeFilter = 'active';
    current.searchQuery = 'хлеб';
    current.filteredTodos = [todo];
    current.emptyMessage = 'Ничего не найдено';
    current.isLoading = true;
    current.errorMessage = 'Нет связи';
    current.hasError = true;
    current.pendingIds = new Set([todo.id]);

    const filter = useTodoFilter();

    expect(filter.filter.value).toBe('active');
    expect(filter.query.value).toBe('хлеб');
    expect(filter.filteredTodos.value).toEqual([todo]);
    expect(filter.emptyMessage.value).toBe('Ничего не найдено');
    expect(filter.isLoading.value).toBe(true);
    expect(filter.errorMessage.value).toBe('Нет связи');
    expect(filter.hasError.value).toBe(true);
    expect(filter.pendingIds.value.has(todo.id)).toBe(true);
    expect(filter.filterOptions).toBe(current.filterOptions);
  });

  it('stays in sync with store changes', async () => {
    const filter = useTodoFilter();
    const current = store();
    const todo = makeTodo({ id: 7, title: 'Купить хлеб' });

    current.activeFilter = 'completed';
    current.searchQuery = 'хлеб';
    current.filteredTodos = [todo];
    current.isLoading = true;

    await nextTick();

    expect(filter.filter.value).toBe('completed');
    expect(filter.query.value).toBe('хлеб');
    expect(filter.filteredTodos.value).toEqual([todo]);
    expect(filter.isLoading.value).toBe(true);
  });

  it('forwards query changes to the store', () => {
    const filter = useTodoFilter();

    filter.setQuery('молоко');
    filter.setQuery(42);
    filter.setQuery(null);

    expect(holder.setQuery).toHaveBeenNthCalledWith(1, 'молоко');
    expect(holder.setQuery).toHaveBeenNthCalledWith(2, 42);
    expect(holder.setQuery).toHaveBeenNthCalledWith(3, null);
  });

  it('forwards filter changes to the store', () => {
    const filter = useTodoFilter();

    filter.setFilter('active');
    filter.setFilter(null);
    filter.setFilter('unknown');

    expect(holder.setFilter).toHaveBeenNthCalledWith(1, 'active');
    expect(holder.setFilter).toHaveBeenNthCalledWith(2, null);
    expect(holder.setFilter).toHaveBeenNthCalledWith(3, 'unknown');
  });

  it('reloads todos through the store', async () => {
    holder.reloadTodos.mockResolvedValueOnce(undefined);
    const filter = useTodoFilter();

    await filter.reload();

    expect(holder.reloadTodos).toHaveBeenCalledOnce();
  });

  it('waits for the store reload before resolving', async () => {
    let finish!: () => void;
    holder.reloadTodos.mockReturnValueOnce(
      new Promise<void>((resolve) => {
        finish = resolve;
      }),
    );

    const filter = useTodoFilter();
    let settled = false;
    const reloading = filter.reload().then(() => {
      settled = true;
    });

    await Promise.resolve();
    expect(settled).toBe(false);

    finish();
    await reloading;

    expect(settled).toBe(true);
  });

  it('exposes a read-only pending id set', () => {
    const current = store();
    current.pendingIds = new Set([1, 2]);

    const filter = useTodoFilter();

    expect(Array.from(filter.pendingIds.value)).toEqual([1, 2]);
  });

  it('reflects the filtered list and empty message from the store', async () => {
    const filter = useTodoFilter();
    const current = store();

    current.filteredTodos = [makeTodo({ id: 1 }), makeTodo({ id: 2, completed: true })];
    current.emptyMessage = 'Нет выполненных задач';

    await nextTick();

    expect(filter.filteredTodos.value.map((todo) => todo.id)).toEqual([1, 2]);
    expect(filter.emptyMessage.value).toBe('Нет выполненных задач');
  });
});
