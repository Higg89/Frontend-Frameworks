import type { ITodoItem, TodoId, TodoUpdate } from '@/types/todo';

export const validationFields = [
  'id',
  'title',
  'completed',
  'createdAt',
  'name',
  'password',
  'email',
  'passwordConfirm',
  'form',
] as const;

export type ValidationField = (typeof validationFields)[number];

export interface ApiSuccess<TData> {
  ok: true;
  data: TData;
}

export interface ApiFailure {
  ok: false;
  error: AppError;
}

export type ApiResult<TData> = ApiSuccess<TData> | ApiFailure;

export interface CreateTodoRequest {
  title: string;
}

export interface UpdateTodoRequest {
  id: TodoId;
  patch: TodoUpdate;
}

export type TodoListResponse = ApiResult<ITodoItem[]>;
export type TodoResponse = ApiResult<ITodoItem>;
export type TodoIdResponse = ApiResult<TodoId>;

export type ErrorKind =
  'validation' | 'not_found' | 'storage' | 'network' | 'business' | 'unexpected';

export interface BaseAppError {
  kind: ErrorKind;
  /** User-facing message. Must never contain technical details. */
  message: string;
  /** Stable machine-readable reason, used for logging and strategies. */
  code?: string;
  /** Network and unexpected errors can be retried by the UI. */
  retryable?: boolean;
}

export interface ValidationError extends BaseAppError {
  kind: 'validation';
  field: ValidationField;
}

export interface NotFoundError extends BaseAppError {
  kind: 'not_found';
  id: TodoId;
}

export interface StorageError extends BaseAppError {
  kind: 'storage';
}

export interface NetworkError extends BaseAppError {
  kind: 'network';
  status?: number;
}

export interface BusinessError extends BaseAppError {
  kind: 'business';
}

export interface UnexpectedError extends BaseAppError {
  kind: 'unexpected';
}

export type AppError =
  ValidationError | NotFoundError | StorageError | NetworkError | BusinessError | UnexpectedError;

export const routeNames = {
  tasks: 'tasks',
  settings: 'settings',
  login: 'login',
  notFound: 'not-found',
} as const;

export type AppRouteName = (typeof routeNames)[keyof typeof routeNames];

export interface AppRouteMeta {
  title: string;
  description?: string;
  breadcrumb?: string;
  requiresAuth?: boolean;
  robots?: string;
  ogImage?: string;
}

declare module 'vue-router' {
  interface RouteMeta {
    title?: string;
    description?: string;
    breadcrumb?: string;
    requiresAuth?: boolean;
    robots?: string;
    ogImage?: string;
  }
}
