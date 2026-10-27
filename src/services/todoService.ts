import { z } from 'zod';
import { ApiService, apiClient, apiFailure, apiSuccess } from '@/services/apiClient';
import type { CreateTodoPayload, TodoListOptions, UpdateTodoPayload } from '@/services/types';
import type { ApiResult, CreateTodoRequest } from '@/types/api';
import type { ITodoItem, TodoId } from '@/types/todo';
import { todoFormSchema, validateWithSchema, validationMessages } from '@/utils/validation';

const TODO_NOT_FOUND = 'Задача не найдена';

/** Kept as a named export for callers that need the request schema itself. */
export const createTodoSchema = todoFormSchema;

export const todoItemSchema: z.ZodType<ITodoItem> = z.object({
  id: z.number().int().positive(),
  title: z.string().trim().min(1).max(200),
  completed: z.boolean(),
  createdAt: z.string().min(1),
});

export const todoListSchema: z.ZodType<ITodoItem[]> = z.array(todoItemSchema);

export { apiFailure, apiSuccess };

/** Validates a new task title with the shared schema and returns the trimmed value. */
export function validateCreateTodo(input: CreateTodoRequest): ApiResult<string> {
  const parsed = validateWithSchema(todoFormSchema, input);

  if (!parsed.ok) {
    return apiFailure(parsed.error);
  }

  return apiSuccess(parsed.data.title);
}

/** Builds a task when the request passes validation. */
export function createTodo(input: CreateTodoRequest, id: TodoId): ApiResult<ITodoItem> {
  const validated = validateCreateTodo(input);

  if (!validated.ok) {
    return validated;
  }

  const todo: ITodoItem = {
    id,
    title: validated.data,
    completed: false,
    createdAt: new Date().toISOString(),
  };

  const checked = todoItemSchema.safeParse(todo);

  if (!checked.success) {
    return apiFailure({
      kind: 'validation',
      field: 'title',
      message: validationMessages.titleRequired,
    });
  }

  return apiSuccess(checked.data);
}

/** Returns the task with its completed flag flipped. */
export function toggleTodo(todos: readonly ITodoItem[], id: TodoId): ApiResult<ITodoItem> {
  const todo = todos.find((item) => item.id === id);

  if (!todo) {
    return apiFailure({ kind: 'not_found', id, message: TODO_NOT_FOUND });
  }

  return apiSuccess({ ...todo, completed: !todo.completed });
}

/** Returns the id of a task that can be removed. */
export function removeTodo(todos: readonly ITodoItem[], id: TodoId): ApiResult<TodoId> {
  const exists = todos.some((item) => item.id === id);

  if (!exists) {
    return apiFailure({ kind: 'not_found', id, message: TODO_NOT_FOUND });
  }

  return apiSuccess(id);
}

export class TodoApi extends ApiService {
  list(
    userId: number,
    signal?: AbortSignal,
    options: TodoListOptions = {},
  ): Promise<ApiResult<ITodoItem[]>> {
    return this.client.request(todoListSchema, {
      url: `/users/${userId}/tasks`,
      signal,
      skipCache: options.skipCache === true,
    });
  }

  create(payload: CreateTodoPayload, signal?: AbortSignal): Promise<ApiResult<ITodoItem>> {
    return this.client.request(todoItemSchema, {
      method: 'POST',
      url: '/tasks',
      body: payload,
      signal,
    });
  }

  update(
    id: TodoId,
    payload: UpdateTodoPayload,
    signal?: AbortSignal,
  ): Promise<ApiResult<ITodoItem>> {
    return this.client.request(todoItemSchema, {
      method: 'PATCH',
      url: `/tasks/${id}`,
      body: payload,
      signal,
    });
  }

  remove(id: TodoId, signal?: AbortSignal): Promise<ApiResult<true>> {
    return this.client.request(
      z.unknown().transform(() => true),
      {
        method: 'DELETE',
        url: `/tasks/${id}`,
        signal,
      },
    );
  }
}

export const todoApi = new TodoApi(apiClient);
