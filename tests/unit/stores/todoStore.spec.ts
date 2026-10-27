import { flushPromises } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { nextTick } from 'vue';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useTodoStore } from '@/stores/todoStore';
import { CANCELED_MESSAGE, reportError } from '@/utils/errorHandling';
import type * as ErrorHandlingModule from '@/utils/errorHandling';
import type { ApiResult, AppError, AuthUser, ITodoItem } from '@/types';
import {
  apiFailure,
  apiSuccess,
  deferred,
  makeTodo,
  networkError,
  testUser,
} from '../../mocks/api';

const mocks = vi.hoisted(() => ({
  api: {
    auth: { login: vi.fn(), register: vi.fn(), refreshToken: vi.fn(), checkEmail: vi.fn() },
    users: { profile: vi.fn(), updateSettings: vi.fn() },
    todos: { list: vi.fn(), create: vi.fn(), update: vi.fn(), remove: vi.fn() },
  },
  currentUser: null as AuthUser | null,
  notify: vi.fn(),
}));

vi.mock('@/composables/useApi', () => ({
  useApi: () => mocks.api,
}));

vi.mock('@/stores/userStore', () => ({
  useUserStore: () => ({
    get currentUser() {
      return mocks.currentUser;
    },
    get isAuthenticated() {
      return mocks.currentUser !== null;
    },
  }),
}));

vi.mock('@/stores/uiStore', () => ({
  useUiStore: () => ({ notify: mocks.notify }),
}));

vi.mock('@/utils/errorHandling', async (importOriginal) => {
  const actual = await importOriginal<typeof ErrorHandlingModule>();

  return { ...actual, reportError: vi.fn() };
});

const api = mocks.api;
const reportErrorMock = vi.mocked(reportError);

let store: ReturnType<typeof useTodoStore>;

function reportOptions(): { context?: string; retry?: () => unknown } {
  const calls = reportErrorMock.mock.calls;
  const lastCall = calls[calls.length - 1];

  if (!lastCall) {
    throw new Error('reportError was not called');
  }

  return lastCall[1] ?? {};
}

beforeEach(() => {
  vi.resetAllMocks();
  localStorage.clear();
  mocks.currentUser = null;

  api.todos.list.mockResolvedValue(apiSuccess([]));
  api.todos.create.mockResolvedValue(apiSuccess(makeTodo()));
  api.todos.update.mockResolvedValue(apiSuccess(makeTodo()));
  api.todos.remove.mockResolvedValue(apiSuccess(true));

  setActivePinia(createPinia());
  store = useTodoStore();
});

describe('initial state', () => {
  it('starts with an empty list, the "all" filter and no errors', () => {
    expect(store.todos).toEqual([]);
    expect(store.filterMode).toBe('all');
    expect(store.activeFilter).toBe('all');
    expect(store.query).toBe('');
    expect(store.searchQuery).toBe('');
    expect(store.filteredTodos).toEqual([]);
    expect(store.emptyMessage).toBe('Список задач пуст');
    expect(store.isLoading).toBe(false);
    expect(store.lastError).toBeNull();
    expect(store.errorMessage).toBe('');
    expect(store.hasError).toBe(false);
    expect(store.filterOptions.map((option) => option.value)).toEqual([
      'all',
      'active',
      'completed',
    ]);
    expect(store.isPending(1)).toBe(false);
  });

  it('restores a saved filter from localStorage', () => {
    localStorage.setItem('todo-filter', JSON.stringify('completed'));
    setActivePinia(createPinia());

    const restored = useTodoStore();

    expect(restored.filterMode).toBe('completed');
    expect(restored.activeFilter).toBe('completed');
  });

  it('falls back to "all" for an invalid saved filter', () => {
    localStorage.setItem('todo-filter', JSON.stringify('unknown'));
    setActivePinia(createPinia());

    expect(useTodoStore().filterMode).toBe('all');
  });
});

describe('loading todos', () => {
  it('does not call the API without an authenticated user', async () => {
    const result = await store.loadTodos();

    expect(result).toEqual({ ok: false, error: { kind: 'network', message: 'Нужно войти' } });
    expect(api.todos.list).not.toHaveBeenCalled();
    expect(store.todos).toEqual([]);
  });

  it('loads the list of the current user', async () => {
    const todos = [makeTodo({ id: 1 }), makeTodo({ id: 2, completed: true })];
    mocks.currentUser = testUser;
    api.todos.list.mockResolvedValue(apiSuccess(todos));

    const result = await store.loadTodos();

    expect(result).toEqual({ ok: true, data: todos });
    expect(store.todos).toEqual(todos);
    expect(store.isLoading).toBe(false);
    expect(store.hasError).toBe(false);
    expect(api.todos.list).toHaveBeenCalledWith(testUser.id, expect.any(AbortSignal), {
      skipCache: false,
    });
  });

  it('exposes loading state while the request is running', async () => {
    const pending = deferred<ApiResult<ITodoItem[]>>();
    mocks.currentUser = testUser;
    api.todos.list.mockReturnValue(pending.promise);

    const loading = store.loadTodos();

    expect(store.isLoading).toBe(true);

    pending.resolve(apiSuccess([]));
    await loading;

    expect(store.isLoading).toBe(false);
  });

  it('stores a network failure and exposes a retry action', async () => {
    const error = networkError();

    mocks.currentUser = testUser;
    api.todos.list.mockResolvedValueOnce(apiFailure(error)).mockResolvedValueOnce(apiSuccess([]));

    const result = await store.loadTodos();

    expect(result).toEqual({ ok: false, error });
    expect(store.hasError).toBe(true);
    expect(store.errorMessage).toBe(error.message);
    expect(store.lastError).toEqual(error);
    expect(reportErrorMock).toHaveBeenCalledWith(
      error,
      expect.objectContaining({ context: 'todo' }),
    );
    expect(reportOptions().context).toBe('todo');

    const retry = reportOptions().retry;

    expect(retry).toBeTypeOf('function');
    await retry?.();

    expect(api.todos.list).toHaveBeenLastCalledWith(testUser.id, expect.any(AbortSignal), {
      skipCache: true,
    });
    expect(store.hasError).toBe(false);
  });

  it('ignores a canceled request', async () => {
    mocks.currentUser = testUser;
    api.todos.list.mockResolvedValue(
      apiFailure({ kind: 'network', code: 'canceled', message: CANCELED_MESSAGE }),
    );

    const result = await store.loadTodos();

    expect(result.ok).toBe(false);
    expect(store.hasError).toBe(false);
    expect(store.errorMessage).toBe('');
    expect(reportErrorMock).not.toHaveBeenCalled();
  });

  it('reloads with cache disabled', async () => {
    mocks.currentUser = testUser;

    await store.reloadTodos();

    expect(api.todos.list).toHaveBeenCalledWith(testUser.id, expect.any(AbortSignal), {
      skipCache: true,
    });
  });

  it('syncs only when a user exists and no list request is running', async () => {
    store.syncTodos();
    expect(api.todos.list).not.toHaveBeenCalled();

    mocks.currentUser = testUser;
    const pending = deferred<ApiResult<ITodoItem[]>>();
    api.todos.list.mockReturnValue(pending.promise);

    store.syncTodos();
    store.syncTodos();

    expect(api.todos.list).toHaveBeenCalledTimes(1);

    pending.resolve(apiSuccess([]));
    await flushPromises();
  });

  it('clears todos, loading state and pending ids', async () => {
    store.todos = [makeTodo()];
    store.pendingIds.add(1);

    store.clearTodos();

    expect(store.todos).toEqual([]);
    expect(store.pendingIds.size).toBe(0);
    expect(store.isLoading).toBe(false);
  });
});

describe('adding todos', () => {
  it('creates a task with a trimmed title', async () => {
    const created = makeTodo({ id: 10, title: 'Купить хлеб' });
    mocks.currentUser = testUser;
    api.todos.create.mockResolvedValue(apiSuccess(created));

    const result = await store.addTodo('  Купить хлеб  ');

    expect(result).toEqual({ ok: true, data: created });
    expect(api.todos.create).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'Купить хлеб',
        completed: false,
        userId: testUser.id,
        tagId: 1,
        createdAt: expect.any(String),
      }),
      expect.any(AbortSignal),
    );
    expect(store.todos).toEqual([created]);
    expect(mocks.notify).toHaveBeenCalledWith('Задача добавлена', 'positive');
  });

  it('rejects an empty title without a request', async () => {
    mocks.currentUser = testUser;

    const result = await store.addTodo('   ');

    expect(result.ok).toBe(false);
    expect(api.todos.create).not.toHaveBeenCalled();
    expect(store.lastError?.kind).toBe('validation');
    expect(store.errorMessage).toBe('Введите название задачи');
    expect(mocks.notify).not.toHaveBeenCalled();
    expect(reportErrorMock).toHaveBeenCalledOnce();
  });

  it('requires an authenticated user', async () => {
    const result = await store.addTodo('Новая задача');

    expect(result.ok).toBe(false);

    if (!result.ok) {
      expect(result.error).toMatchObject({ kind: 'business', message: 'Нужно войти в аккаунт' });
    }

    expect(api.todos.create).not.toHaveBeenCalled();
    expect(store.lastError?.kind).toBe('business');
  });

  it('keeps the list intact and offers a retry after a network failure', async () => {
    const error = networkError();
    const created = makeTodo({ id: 11, title: 'Новая задача' });
    mocks.currentUser = testUser;
    api.todos.create
      .mockResolvedValueOnce(apiFailure(error))
      .mockResolvedValueOnce(apiSuccess(created));

    const result = await store.addTodo('Новая задача');

    expect(result).toEqual({ ok: false, error });
    expect(store.todos).toEqual([]);
    expect(store.lastError).toEqual(error);
    expect(reportOptions().retry).toBeTypeOf('function');

    await reportOptions().retry?.();

    expect(store.todos).toEqual([created]);
    expect(reportErrorMock).toHaveBeenCalledOnce();
  });

  it('passes a network error from a rejected request to the caller', async () => {
    mocks.currentUser = testUser;
    api.todos.create.mockRejectedValue(new Error('socket closed'));

    await expect(store.addTodo('Новая задача')).rejects.toThrow('socket closed');
  });
});

describe('toggling todos', () => {
  it('updates the completed flag', async () => {
    const todo = makeTodo({ id: 1, completed: false });
    const updated = { ...todo, completed: true };
    store.todos = [todo];
    mocks.currentUser = testUser;
    api.todos.update.mockResolvedValue(apiSuccess(updated));

    const result = await store.toggleTodo(1);

    expect(result).toEqual({ ok: true, data: updated });
    expect(api.todos.update).toHaveBeenCalledWith(1, { completed: true }, expect.any(AbortSignal));
    expect(store.todos[0]).toEqual(updated);
    expect(store.isPending(1)).toBe(false);
  });

  it('marks the task as pending while the request is running', async () => {
    const todo = makeTodo({ id: 1, completed: false });
    const pendingRequest = deferred<ApiResult<ITodoItem>>();
    store.todos = [todo];
    mocks.currentUser = testUser;
    api.todos.update.mockReturnValue(pendingRequest.promise);

    const toggling = store.toggleTodo(1);

    expect(store.isPending(1)).toBe(true);
    expect(store.pendingIds.has(1)).toBe(true);

    pendingRequest.resolve(apiSuccess({ ...todo, completed: true }));
    await toggling;

    expect(store.isPending(1)).toBe(false);
  });

  it('ignores a second toggle for a pending task', async () => {
    const todo = makeTodo({ id: 1, completed: false });
    const pendingRequest = deferred<ApiResult<ITodoItem>>();
    store.todos = [todo];
    mocks.currentUser = testUser;
    api.todos.update.mockReturnValue(pendingRequest.promise);

    const first = store.toggleTodo(1);
    const second = await store.toggleTodo(1);

    expect(second).toEqual({ ok: true, data: todo });
    expect(api.todos.update).toHaveBeenCalledOnce();

    pendingRequest.resolve(apiSuccess({ ...todo, completed: true }));
    await first;
  });

  it('reports a missing task without a request', async () => {
    mocks.currentUser = testUser;

    const result = await store.toggleTodo(404);

    expect(result.ok).toBe(false);

    if (!result.ok) {
      expect(result.error).toMatchObject({ kind: 'not_found', id: 404 });
    }

    expect(api.todos.update).not.toHaveBeenCalled();
    expect(store.lastError?.kind).toBe('not_found');
  });

  it('keeps the old value and retries after a failure', async () => {
    const todo = makeTodo({ id: 1, completed: false });
    const error = networkError();
    store.todos = [todo];
    mocks.currentUser = testUser;
    api.todos.update
      .mockResolvedValueOnce(apiFailure(error))
      .mockResolvedValueOnce(apiSuccess({ ...todo, completed: true }));

    const result = await store.toggleTodo(1);

    expect(result).toEqual({ ok: false, error });
    expect(store.todos[0]).toEqual(todo);
    expect(store.isPending(1)).toBe(false);
    expect(reportOptions().retry).toBeTypeOf('function');

    await reportOptions().retry?.();

    expect(store.todos[0]?.completed).toBe(true);
  });

  it('reports a missing task when the user is not authenticated', async () => {
    store.todos = [makeTodo({ id: 1 })];

    const result = await store.toggleTodo(1);

    expect(result.ok).toBe(false);
    expect(store.lastError?.kind).toBe('not_found');
  });
});

describe('deleting todos', () => {
  it('removes the task after a successful request', async () => {
    store.todos = [makeTodo({ id: 1 }), makeTodo({ id: 2 })];
    mocks.currentUser = testUser;

    const result = await store.deleteTodo(1);

    expect(result).toEqual({ ok: true, data: 1 });
    expect(api.todos.remove).toHaveBeenCalledWith(1, expect.any(AbortSignal));
    expect(store.todos.map((todo) => todo.id)).toEqual([2]);
    expect(mocks.notify).toHaveBeenCalledWith('Задача удалена', 'info');
  });

  it('requires an authenticated user', async () => {
    store.todos = [makeTodo({ id: 1 })];

    const result = await store.deleteTodo(1);

    expect(result.ok).toBe(false);

    if (!result.ok) {
      expect(result.error).toMatchObject({ kind: 'business', message: 'Нужно войти в аккаунт' });
    }

    expect(api.todos.remove).not.toHaveBeenCalled();
    expect(store.todos).toHaveLength(1);
  });

  it('keeps the task and retries after a network failure', async () => {
    const todo = makeTodo({ id: 1 });
    const error = networkError();
    store.todos = [todo];
    mocks.currentUser = testUser;
    api.todos.remove
      .mockResolvedValueOnce(apiFailure(error))
      .mockResolvedValueOnce(apiSuccess(true));

    const result = await store.deleteTodo(1);

    expect(result).toEqual({ ok: false, error });
    expect(store.todos).toEqual([todo]);
    expect(store.isPending(1)).toBe(false);
    expect(reportOptions().retry).toBeTypeOf('function');

    await reportOptions().retry?.();

    expect(store.todos).toEqual([]);
  });

  it('ignores a second delete for a pending task', async () => {
    const todo = makeTodo({ id: 1 });
    const pendingRequest = deferred<ApiResult<true>>();
    store.todos = [todo];
    mocks.currentUser = testUser;
    api.todos.remove.mockReturnValue(pendingRequest.promise);

    const first = store.deleteTodo(1);
    const second = await store.deleteTodo(1);

    expect(second).toEqual({ ok: true, data: 1 });
    expect(api.todos.remove).toHaveBeenCalledOnce();
    expect(store.isPending(1)).toBe(true);

    pendingRequest.resolve(apiSuccess(true));
    await first;
  });
});

describe('filtering and search', () => {
  const active = makeTodo({ id: 1, title: 'Купить хлеб' });
  const completed = makeTodo({ id: 2, title: 'Позвонить маме', completed: true });
  const milk = makeTodo({ id: 3, title: 'Купить молоко' });

  beforeEach(() => {
    store.todos = [active, completed, milk];
  });

  it('shows every task with the "all" filter', () => {
    expect(store.filteredTodos).toEqual([active, completed, milk]);
  });

  it('filters active tasks', () => {
    store.setFilter('active');

    expect(store.activeFilter).toBe('active');
    expect(store.filteredTodos).toEqual([active, milk]);
  });

  it('filters completed tasks', () => {
    store.setFilter('completed');

    expect(store.filteredTodos).toEqual([completed]);
  });

  it('searches by title case-insensitively', () => {
    store.setQuery('  КУПИТЬ ');

    expect(store.searchQuery).toBe('  КУПИТЬ ');
    expect(store.filteredTodos).toEqual([active, milk]);
  });

  it('combines a filter with a search query', () => {
    store.setFilter('active');
    store.setQuery('молоко');

    expect(store.filteredTodos).toEqual([milk]);
  });

  it('ignores an unknown filter value', () => {
    store.setFilter('unknown');
    store.setFilter(null);
    store.setFilter(42);

    expect(store.filterMode).toBe('all');
  });

  it('normalizes the query setter', () => {
    store.setQuery(123);
    expect(store.query).toBe('123');

    store.setQuery(null);
    expect(store.query).toBe('');
  });

  it('persists the selected filter', async () => {
    store.setFilter('completed');
    await nextTick();

    expect(localStorage.getItem('todo-filter')).toBe(JSON.stringify('completed'));
  });

  it('chooses an empty message for the current mode', () => {
    store.todos = [];

    expect(store.emptyMessage).toBe('Список задач пуст');

    store.setFilter('active');
    expect(store.emptyMessage).toBe('Нет активных задач');

    store.setFilter('completed');
    expect(store.emptyMessage).toBe('Нет выполненных задач');

    store.setFilter('all');
    store.setQuery('хлеб');
    expect(store.emptyMessage).toBe('Ничего не найдено');
  });

  it('does not treat a whitespace query as a search', () => {
    store.setQuery('   ');

    expect(store.filteredTodos).toEqual([active, completed, milk]);
    expect(store.emptyMessage).toBe('Список задач пуст');
  });
});

describe('edge cases', () => {
  it('exposes the last error and clears it on a new request', async () => {
    mocks.currentUser = testUser;
    api.todos.list
      .mockResolvedValueOnce(apiFailure(networkError()))
      .mockResolvedValueOnce(apiSuccess([]));

    await store.loadTodos();
    expect(store.hasError).toBe(true);

    await store.loadTodos();
    expect(store.hasError).toBe(false);
  });

  it('keeps task mutations parallel', async () => {
    const first = makeTodo({ id: 1, completed: false });
    const second = makeTodo({ id: 2, completed: false });
    store.todos = [first, second];
    mocks.currentUser = testUser;
    api.todos.update
      .mockResolvedValueOnce(apiSuccess({ ...first, completed: true }))
      .mockResolvedValueOnce(apiSuccess({ ...second, completed: true }));

    await Promise.all([store.toggleTodo(1), store.toggleTodo(2)]);

    expect(store.todos.every((todo) => todo.completed)).toBe(true);
    expect(api.todos.update).toHaveBeenCalledTimes(2);
  });

  it('reports a business error as AppError to the error pipeline', async () => {
    const result = await store.addTodo('Задача');

    expect(result.ok).toBe(false);

    if (result.ok) {
      return;
    }

    const error: AppError = result.error;

    expect(error.kind).toBe('business');
    expect(reportErrorMock).toHaveBeenCalledWith(
      error,
      expect.objectContaining({ context: 'todo' }),
    );
  });
});
