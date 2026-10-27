import { vi, type Mock } from 'vitest';
import type { ApiResult, AppError, AuthUser, ITodoItem } from '@/types';

/**
 * A hand-written fake of the API layer.
 *
 * Stores never touch HTTP directly: they call `useApi()`, which returns the
 * three services below. Replacing that module keeps unit tests fully isolated
 * from axios, the network, retries, and caches, while still exercising the real
 * store logic that consumes `ApiResult`.
 */
export interface ApiMock {
  auth: {
    login: Mock;
    register: Mock;
    refreshToken: Mock;
    checkEmail: Mock;
  };
  users: {
    profile: Mock;
    updateSettings: Mock;
  };
  todos: {
    list: Mock;
    create: Mock;
    update: Mock;
    remove: Mock;
  };
}

export function createApiMock(): ApiMock {
  return {
    auth: {
      login: vi.fn(),
      register: vi.fn(),
      refreshToken: vi.fn(),
      checkEmail: vi.fn(),
    },
    users: {
      profile: vi.fn(),
      updateSettings: vi.fn(),
    },
    todos: {
      list: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      remove: vi.fn(),
    },
  };
}

export function apiSuccess<TData>(data: TData): ApiResult<TData> {
  return { ok: true, data };
}

export function apiFailure(error: AppError): ApiResult<never> {
  return { ok: false, error };
}

export const testUser: AuthUser = {
  id: 1,
  name: 'Алексей',
  email: 'alexey@example.com',
  token: 'access-token',
  refreshToken: 'refresh-token',
};

export function makeTodo(overrides: Partial<ITodoItem> = {}): ITodoItem {
  return {
    id: 1,
    title: 'Задача',
    completed: false,
    createdAt: '2026-01-15T10:00:00.000Z',
    ...overrides,
  };
}

export function networkError(message = 'Нет связи с сервером'): AppError {
  return { kind: 'network', message, retryable: true };
}

export function validationError(message = 'Некорректное значение'): AppError {
  return { kind: 'validation', field: 'title', message, code: 'validation' };
}

export interface Deferred<TData> {
  promise: Promise<TData>;
  resolve: (value: TData) => void;
  reject: (reason?: unknown) => void;
}

/** Creates a promise that the test controls manually (for loading states). */
export function deferred<TData>(): Deferred<TData> {
  let resolve!: (value: TData) => void;
  let reject!: (reason?: unknown) => void;

  const promise = new Promise<TData>((res, rej) => {
    resolve = res;
    reject = rej;
  });

  return { promise, resolve, reject };
}
