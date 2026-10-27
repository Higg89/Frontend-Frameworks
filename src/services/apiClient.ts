import axios, { isAxiosError, type AxiosInstance, type InternalAxiosRequestConfig } from 'axios';
import type { ZodType } from 'zod';
import { createMockAdapter } from '@/services/mockApi';
import {
  BusinessException,
  CanceledException,
  NetworkException,
  NotFoundException,
  UnexpectedException,
  ValidationException,
  normalizeError,
  withRetry,
} from '@/utils/errorHandling';
import type { ApiFailure, ApiResult, ApiSuccess, AppError, ValidationField } from '@/types';
import { validationFields } from '@/types';
import { readEnvFlag, readEnvString } from '@/utils/env';

const API_PREFIX = readEnvString(import.meta.env.VITE_API_BASE_URL, '/api');
const USE_MOCK_API = readEnvFlag(import.meta.env.VITE_USE_MOCK_API);
const CACHE_TTL_MS = 10_000;
const MAX_RETRIES = 2;

export { CANCELED_MESSAGE } from '@/utils/errorHandling';

export interface AuthBridge {
  getAccessToken: () => string | null;
  refresh: () => Promise<string | null>;
  onSessionExpired: () => void;
}

interface RequestConfig {
  method?: 'GET' | 'POST' | 'PATCH' | 'DELETE';
  url: string;
  body?: unknown;
  signal?: AbortSignal | undefined;
  skipAuth?: boolean;
  skipAuthRefresh?: boolean;
  skipRetry?: boolean;
  skipCache?: boolean;
}

interface CacheEntry {
  at: number;
  data: unknown;
}

interface RetryableConfig extends InternalAxiosRequestConfig {
  retryCount?: number;
  skipAuth?: boolean;
  skipAuthRefresh?: boolean;
  skipRetry?: boolean;
}

declare module 'axios' {
  interface InternalAxiosRequestConfig {
    retryCount?: number;
    skipAuth?: boolean;
    skipAuthRefresh?: boolean;
    skipRetry?: boolean;
  }
}

/**
 * Shared Axios client: token refresh, retries, and a short GET cache.
 * The access token stays in the Pinia user store; this class only asks for it.
 *
 * HTTP failures are converted into domain exceptions here and then go through
 * the single `normalizeError` pipeline, so the UI never receives Axios details.
 */
export class ApiClient {
  private readonly http: AxiosInstance;
  private bridge: AuthBridge | null = null;
  private refreshTask: Promise<string | null> | null = null;
  private readonly cache = new Map<string, CacheEntry>();
  private readonly pending = new Map<string, Promise<ApiResult<unknown>>>();

  constructor() {
    this.http = axios.create({
      baseURL: API_PREFIX,
      // GitHub Pages cannot run the mock server, so the published preview can
      // use the in-browser demo API instead. Disabled by default.
      ...(USE_MOCK_API ? { adapter: createMockAdapter() } : {}),
    });
    this.http.interceptors.request.use((config) => this.attachToken(config));
    this.http.interceptors.response.use(
      (response) => response,
      (error: unknown) => this.refreshOnUnauthorized(error),
    );
  }

  bindAuth(bridge: AuthBridge): void {
    this.bridge = bridge;
  }

  /** Drops cached responses, for example after logout or a user switch. */
  clearCache(): void {
    this.cache.clear();
    this.pending.clear();
  }

  request<TData>(schema: ZodType<TData>, config: RequestConfig): Promise<ApiResult<TData>> {
    const method = config.method ?? 'GET';
    const key = `${method} ${config.url}`;

    if (method === 'GET' && config.skipCache !== true) {
      const cached = this.readCache(key, schema);

      if (cached) {
        return Promise.resolve(cached);
      }

      const current = this.pending.get(key);

      if (current) {
        return current as Promise<ApiResult<TData>>;
      }
    }

    const task = this.send(schema, config, method).then((result) => {
      if (result.ok && method === 'GET' && config.skipCache !== true) {
        this.cache.set(key, { at: Date.now(), data: result.data });
      }

      if (result.ok && method !== 'GET') {
        this.invalidate(config.url);
      }

      return result;
    });

    if (method === 'GET' && config.skipCache !== true) {
      this.pending.set(key, task);
      void task.finally(() => {
        this.pending.delete(key);
      });
    }

    return task;
  }

  private async send<TData>(
    schema: ZodType<TData>,
    config: RequestConfig,
    method: 'GET' | 'POST' | 'PATCH' | 'DELETE',
  ): Promise<ApiResult<TData>> {
    try {
      const requestConfig: {
        url: string;
        method: 'GET' | 'POST' | 'PATCH' | 'DELETE';
        data?: unknown;
        signal?: AbortSignal;
        skipAuth: boolean;
        skipAuthRefresh: boolean;
        skipRetry: boolean;
      } = {
        url: config.url,
        method,
        skipAuth: config.skipAuth === true,
        skipAuthRefresh: config.skipAuthRefresh === true,
        skipRetry: config.skipRetry === true,
      };

      if (config.body !== undefined) {
        requestConfig.data = config.body;
      }

      if (config.signal) {
        requestConfig.signal = config.signal;
      }

      const response = await withRetry(() => this.http.request(requestConfig), {
        attempts: MAX_RETRIES + 1,
        baseDelayMs: 300,
        shouldRetry: (cause): boolean => config.skipRetry !== true && isRetryableRequest(cause),
        ...(config.signal ? { signal: config.signal } : {}),
      });
      const parsed = schema.safeParse(response.data);

      if (!parsed.success) {
        return apiFailure(
          normalizeError(
            new UnexpectedException('Сервер вернул неожиданный ответ', {
              code: 'invalid-response',
            }),
          ),
        );
      }

      return apiSuccess(parsed.data);
    } catch (error: unknown) {
      return apiFailure(normalizeError(toHttpException(error)));
    }
  }

  private readCache<TData>(key: string, schema: ZodType<TData>): ApiResult<TData> | null {
    const entry = this.cache.get(key);

    if (!entry || Date.now() - entry.at > CACHE_TTL_MS) {
      this.cache.delete(key);
      return null;
    }

    const parsed = schema.safeParse(entry.data);

    if (!parsed.success) {
      this.cache.delete(key);
      return null;
    }

    return apiSuccess(parsed.data);
  }

  private invalidate(url: string): void {
    const path = url.split('?')[0] ?? url;

    for (const key of this.cache.keys()) {
      if (key.includes(path) || key.includes('/tasks') || key.includes('/users')) {
        this.cache.delete(key);
      }
    }
  }

  private attachToken(config: InternalAxiosRequestConfig): InternalAxiosRequestConfig {
    if (config.skipAuth === true) {
      return config;
    }

    const token = this.bridge?.getAccessToken() ?? null;

    if (token) {
      config.headers.set('Authorization', `Bearer ${token}`);
    }

    return config;
  }

  private async refreshOnUnauthorized(error: unknown): Promise<unknown> {
    if (!isAxiosError(error) || error.response?.status !== 401) {
      return rejectUnknown(error);
    }

    const config = error.config as RetryableConfig | undefined;

    if (!config || config.skipAuthRefresh === true || config.retryCount === -1) {
      return rejectUnknown(error);
    }

    const nextToken = await this.refreshOnce();

    if (!nextToken) {
      this.bridge?.onSessionExpired();
      return rejectUnknown(error);
    }

    config.retryCount = -1;
    config.headers.set('Authorization', `Bearer ${nextToken}`);
    return this.http.request(config);
  }

  private refreshOnce(): Promise<string | null> {
    if (!this.refreshTask) {
      const refresh = this.bridge?.refresh;

      this.refreshTask = (refresh ? refresh() : Promise.resolve(null)).finally(() => {
        this.refreshTask = null;
      });
    }

    return this.refreshTask;
  }
}

export const apiClient = new ApiClient();

export function apiSuccess<TData>(data: TData): ApiSuccess<TData> {
  return { ok: true, data };
}

export function apiFailure(error: AppError): ApiFailure {
  return { ok: false, error };
}

export abstract class ApiService {
  constructor(protected readonly client: ApiClient) {}
}

/** Network and temporary server errors are safe to retry. */
function isRetryableRequest(error: unknown): boolean {
  if (!isAxiosError(error)) {
    return false;
  }

  if (error.code === 'ERR_CANCELED') {
    return false;
  }

  const status = error.response?.status;

  return (
    status === undefined || status === 429 || status === 502 || status === 503 || status === 504
  );
}

function toHttpException(error: unknown): unknown {
  if (!isAxiosError(error)) {
    return error;
  }

  if (error.code === 'ERR_CANCELED') {
    return new CanceledException();
  }

  const status = error.response?.status;
  const body = error.response?.data;
  const message = readMessage(body);
  const code = readCode(body);
  const field = readField(body);
  const isAuthRequest = error.config?.url?.includes('/auth/') === true;

  if (status === 400 || status === 422) {
    return new ValidationException(message, field ?? 'form', {
      ...(code !== undefined ? { code } : {}),
    });
  }

  if (status === 401) {
    return new BusinessException(isAuthRequest ? message : 'Требуется войти в аккаунт', {
      code: code ?? 'unauthorized',
    });
  }

  if (status === 403) {
    return new BusinessException('Недостаточно прав для этого действия', {
      code: code ?? 'forbidden',
    });
  }

  if (status === 404) {
    return new NotFoundException(message, {
      ...(code !== undefined ? { code } : {}),
    });
  }

  if (status === 409) {
    return field
      ? new ValidationException(message, field, {
          ...(code !== undefined ? { code } : {}),
        })
      : new BusinessException(message, { code: code ?? 'conflict' });
  }

  if (status !== undefined && status >= 500) {
    return new NetworkException('Сервер временно недоступен. Попробуйте ещё раз', status, {
      ...(code !== undefined ? { code } : {}),
    });
  }

  if (status === 429) {
    return new NetworkException('Слишком много запросов. Попробуйте чуть позже', status, {
      ...(code !== undefined ? { code } : {}),
    });
  }

  if (status === undefined) {
    return new NetworkException('Нет связи с сервером. Проверьте подключение и попробуйте ещё раз');
  }

  return new BusinessException(message, { code: code ?? 'request-failed' });
}

function readRecord(data: unknown): Record<string, unknown> | null {
  return typeof data === 'object' && data !== null ? (data as Record<string, unknown>) : null;
}

function readMessage(data: unknown): string {
  const record = readRecord(data);

  if (record) {
    const message = record.message;

    if (typeof message === 'string' && message.trim().length > 0) {
      return message;
    }
  }

  if (typeof data === 'string' && data.trim().length > 0) {
    return data;
  }

  return 'Не удалось выполнить запрос';
}

function readCode(data: unknown): string | undefined {
  const code = readRecord(data)?.code;

  return typeof code === 'string' && code.length > 0 ? code : undefined;
}

function readField(data: unknown): ValidationField | undefined {
  const field = readRecord(data)?.field;

  if (typeof field !== 'string') {
    return undefined;
  }

  return (validationFields as readonly string[]).includes(field)
    ? (field as ValidationField)
    : undefined;
}

function rejectUnknown(error: unknown): Promise<never> {
  if (error instanceof Error) {
    return Promise.reject(error);
  }

  return Promise.reject(new Error('Не удалось выполнить запрос'));
}
