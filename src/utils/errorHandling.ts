import { ZodError } from 'zod';
import type { App, ComponentPublicInstance } from 'vue';
import { validationFields } from '@/types/api';
import type { AppError, ErrorKind, ValidationField } from '@/types/api';

/**
 * Central error pipeline: classify -> log -> user message -> report to the UI.
 * Components never build error messages themselves: they either show the
 * normalized error or call reportError().
 */

export const CANCELED_MESSAGE = 'Запрос отменён';

const UNEXPECTED_MESSAGE = 'Что-то пошло не так. Попробуйте позже';

const KIND_FALLBACKS: Record<ErrorKind, string> = {
  validation: 'Проверьте введённые данные',
  not_found: 'Запись не найдена',
  storage: 'Не удалось сохранить данные',
  network: 'Нет связи с сервером. Проверьте подключение и попробуйте ещё раз',
  business: 'Не удалось выполнить действие',
  unexpected: UNEXPECTED_MESSAGE,
};

export interface AppExceptionOptions {
  code?: string;
  status?: number;
  retryable?: boolean;
  cause?: unknown;
}

export class AppException extends Error {
  readonly kind: ErrorKind;
  readonly code: string;
  readonly status?: number;
  readonly retryable: boolean;

  constructor(message: string, kind: ErrorKind, options: AppExceptionOptions = {}) {
    super(message);
    this.name = new.target.name;
    this.kind = kind;
    this.code = options.code ?? kind;

    if (options.status !== undefined) {
      this.status = options.status;
    }

    this.retryable = options.retryable ?? false;

    if (options.cause !== undefined) {
      this.cause = options.cause;
    }
  }
}

export class ValidationException extends AppException {
  readonly field: ValidationField;

  constructor(message: string, field: ValidationField = 'form', options: AppExceptionOptions = {}) {
    super(message, 'validation', options);
    this.field = field;
  }
}

export class BusinessException extends AppException {
  constructor(message: string, options: AppExceptionOptions = {}) {
    super(message, 'business', options);
  }
}

export class NetworkException extends AppException {
  constructor(message: string, status?: number, options: AppExceptionOptions = {}) {
    super(message, 'network', {
      ...options,
      retryable: options.retryable ?? true,
      ...(status === undefined ? {} : { status }),
    });
  }
}

export class NotFoundException extends AppException {
  constructor(message: string, options: AppExceptionOptions = {}) {
    super(message, 'not_found', options);
  }
}

export class StorageException extends AppException {
  constructor(message: string, options: AppExceptionOptions = {}) {
    super(message, 'storage', options);
  }
}

export class UnexpectedException extends AppException {
  constructor(message: string = UNEXPECTED_MESSAGE, options: AppExceptionOptions = {}) {
    super(message, 'unexpected', { ...options, retryable: options.retryable ?? false });
  }
}

export class CanceledException extends AppException {
  constructor(message: string = CANCELED_MESSAGE) {
    super(message, 'network', { code: 'canceled', retryable: false });
  }
}

export function isCanceled(error: unknown): boolean {
  if (error instanceof CanceledException) {
    return true;
  }

  if (error instanceof AppException) {
    return error.code === 'canceled';
  }

  if (isAppError(error)) {
    return error.code === 'canceled' || error.message === CANCELED_MESSAGE;
  }

  return false;
}

export function isAppError(value: unknown): value is AppError {
  if (typeof value !== 'object' || value === null) {
    return false;
  }

  const candidate = value as { kind?: unknown; message?: unknown };

  return (
    typeof candidate.message === 'string' &&
    typeof candidate.kind === 'string' &&
    Object.prototype.hasOwnProperty.call(KIND_FALLBACKS, candidate.kind)
  );
}

/** Keeps only messages that are safe to show to an end user. */
export function sanitizeUserMessage(message: unknown): string | null {
  if (typeof message !== 'string') {
    return null;
  }

  const trimmed = message.trim();

  if (trimmed.length === 0 || trimmed.length > 160) {
    return null;
  }

  if (/[\p{Cc}]/u.test(trimmed)) {
    return null;
  }

  if (/<[^>]*>/.test(trimmed)) {
    return null;
  }

  if (
    /(failed to fetch|networkerror|econnrefused|errno|stack trace|traceback|axios|xmlhttprequest|\[object)/i.test(
      trimmed,
    )
  ) {
    return null;
  }

  if (/^\s*(error|typeerror|referenceerror|syntaxerror|rangeerror)\b/i.test(trimmed)) {
    return null;
  }

  if (/^\s*at\s+\w+/i.test(trimmed) || /\bat\s+\w+\s*\(/.test(trimmed)) {
    return null;
  }

  if (/^[a-z_$][\w$]*:\s/i.test(trimmed)) {
    return null;
  }

  return trimmed;
}

export function toUserMessage(error: AppError): string {
  if (isCanceled(error)) {
    return CANCELED_MESSAGE;
  }

  return sanitizeUserMessage(error.message) ?? KIND_FALLBACKS[error.kind] ?? UNEXPECTED_MESSAGE;
}

export function isRetryable(error: AppError): boolean {
  return error.retryable === true;
}

/** Strategy pattern: one strategy per error source, tried in order. */
export interface ErrorStrategy {
  readonly name: string;
  matches(cause: unknown): boolean;
  toAppError(cause: unknown): AppError;
}

const fallbackMessage = (kind: ErrorKind, message: string): string =>
  sanitizeUserMessage(message) ?? KIND_FALLBACKS[kind];

class AppErrorStrategy implements ErrorStrategy {
  readonly name = 'app-error';

  matches(cause: unknown): boolean {
    return isAppError(cause);
  }

  toAppError(cause: unknown): AppError {
    return cause as AppError;
  }
}

class CanceledStrategy implements ErrorStrategy {
  readonly name = 'canceled';

  matches(cause: unknown): boolean {
    return (
      cause instanceof CanceledException || (cause instanceof Error && cause.name === 'AbortError')
    );
  }

  toAppError(): AppError {
    return {
      kind: 'network',
      code: 'canceled',
      retryable: false,
      message: CANCELED_MESSAGE,
    };
  }
}

class ExceptionStrategy implements ErrorStrategy {
  readonly name = 'exception';

  matches(cause: unknown): boolean {
    return cause instanceof AppException;
  }

  toAppError(cause: unknown): AppError {
    const exception = cause as AppException;
    const message = fallbackMessage(exception.kind, exception.message);

    switch (exception.kind) {
      case 'validation':
        return {
          kind: 'validation',
          field: exception instanceof ValidationException ? exception.field : 'form',
          message,
          code: exception.code,
        };
      case 'not_found':
        return { kind: 'not_found', id: 0, message, code: exception.code };
      case 'storage':
        return { kind: 'storage', message, code: exception.code };
      case 'business':
        return { kind: 'business', message, code: exception.code };
      case 'unexpected':
        return {
          kind: 'unexpected',
          message,
          code: exception.code,
          retryable: exception.retryable,
        };
      case 'network':
      default:
        return {
          kind: 'network',
          message,
          code: exception.code,
          retryable: exception.retryable,
          ...(exception.status !== undefined ? { status: exception.status } : {}),
        };
    }
  }
}

class ZodStrategy implements ErrorStrategy {
  readonly name = 'zod';

  matches(cause: unknown): boolean {
    return cause instanceof ZodError;
  }

  toAppError(cause: unknown): AppError {
    const issue = (cause as ZodError).issues[0];
    const rawField = issue?.path.length ? issue.path.map(String).join('.') : 'form';
    const field = (validationFields as readonly string[]).includes(rawField)
      ? (rawField as ValidationField)
      : 'form';

    return {
      kind: 'validation',
      field,
      message: issue?.message ?? KIND_FALLBACKS.validation,
      code: issue?.code ?? 'validation',
    };
  }
}

const strategies: ErrorStrategy[] = [
  // Domain exceptions are also Error instances. They must be handled before
  // the structural AppError check, otherwise isAppError() matches them and
  // their technical message / validation field would bypass normalization.
  new CanceledStrategy(),
  new ExceptionStrategy(),
  new AppErrorStrategy(),
  new ZodStrategy(),
];

export function registerErrorStrategy(strategy: ErrorStrategy, prepend = false): void {
  if (prepend) {
    strategies.unshift(strategy);
  } else {
    strategies.push(strategy);
  }
}

export function normalizeError(cause: unknown): AppError {
  for (const strategy of strategies) {
    if (strategy.matches(cause)) {
      return strategy.toAppError(cause);
    }
  }

  return {
    kind: 'unexpected',
    code: 'unexpected',
    retryable: false,
    message: UNEXPECTED_MESSAGE,
  };
}

export interface ErrorLogEntry {
  at: string;
  context: string;
  kind: ErrorKind;
  code: string;
  message: string;
  technical: string;
  stack?: string;
}

export interface ErrorLoggerOptions {
  capacity?: number;
  console?: boolean;
}

export interface ErrorLogger {
  log: (error: AppError, context: string, cause?: unknown) => ErrorLogEntry;
  entries: () => readonly ErrorLogEntry[];
  clear: () => void;
}

export function createErrorLogger(options: ErrorLoggerOptions = {}): ErrorLogger {
  const capacity = Math.max(1, options.capacity ?? 50);
  const writeToConsole = options.console === true;
  const entries: ErrorLogEntry[] = [];

  function describe(value: unknown): string {
    if (value instanceof Error) {
      return value.message;
    }

    if (typeof value === 'string') {
      return value;
    }

    try {
      return JSON.stringify(value) ?? String(value);
    } catch {
      return String(value);
    }
  }

  return {
    log(error, context, cause) {
      const entry: ErrorLogEntry = {
        at: new Date().toISOString(),
        context,
        kind: error.kind,
        code: error.code ?? error.kind,
        message: toUserMessage(error),
        technical: describe(cause ?? error),
      };

      const stack = cause instanceof Error ? otherStack(cause) : undefined;

      if (stack !== undefined) {
        entry.stack = stack;
      }

      entries.push(entry);

      if (entries.length > capacity) {
        entries.shift();
      }

      if (writeToConsole) {
        // Technical details stay in the developer console only.
        console.error(`[${context}]`, error, cause);
      }

      return entry;
    },
    entries: () => entries,
    clear: () => {
      entries.length = 0;
    },
  };
}

function otherStack(error: Error): string | undefined {
  return error.stack;
}

export const errorLog = createErrorLogger({
  console: import.meta.env.DEV,
});

export type RetryAction = () => unknown;

export interface RetryEvent {
  attempt: number;
  attempts: number;
  delay: number;
  error: unknown;
}

export interface RetryOptions {
  /** Total number of tries, including the first one. */
  attempts?: number;
  baseDelayMs?: number;
  maxDelayMs?: number;
  shouldRetry?: (cause: unknown, attempt: number) => boolean;
  onRetry?: (event: RetryEvent) => void;
  signal?: AbortSignal;
}

export const DEFAULT_RETRY_ATTEMPTS = 3;

/** Retries a task with exponential backoff while the error is retryable. */
export async function withRetry<TResult>(
  task: (attempt: number) => Promise<TResult>,
  options: RetryOptions = {},
): Promise<TResult> {
  const attempts = Math.max(1, options.attempts ?? DEFAULT_RETRY_ATTEMPTS);
  const baseDelayMs = Math.max(0, options.baseDelayMs ?? 300);
  const maxDelayMs = Math.max(baseDelayMs, options.maxDelayMs ?? 3_000);
  const shouldRetry = options.shouldRetry ?? ((cause) => isRetryable(normalizeError(cause)));
  let lastError: unknown = null;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    throwIfAborted(options.signal);

    try {
      return await task(attempt);
    } catch (cause) {
      lastError = cause;

      if (attempt >= attempts || options.signal?.aborted === true || !shouldRetry(cause, attempt)) {
        throw cause;
      }

      const delay = Math.min(baseDelayMs * 2 ** (attempt - 1), maxDelayMs);
      options.onRetry?.({ attempt, attempts, delay, error: cause });
      await wait(delay, options.signal);
    }
  }

  if (lastError instanceof Error) {
    throw lastError;
  }

  throw new UnexpectedException();
}

export interface ErrorReport {
  error: AppError;
  context: string;
  retry?: RetryAction;
}

export interface ReportErrorOptions {
  context?: string;
  retry?: RetryAction;
  /** Keep the report out of UI notifications, but still log it. */
  silent?: boolean;
}

const errorSinks = new Set<(report: ErrorReport) => void>();

export function subscribeToErrorReports(sink: (report: ErrorReport) => void): () => void {
  errorSinks.add(sink);

  return () => {
    errorSinks.delete(sink);
  };
}

/**
 * The only entry point for reporting errors.
 * It classifies the cause, logs it, and passes it to UI subscribers.
 */
export function reportError(cause: unknown, options: ReportErrorOptions = {}): AppError {
  const error = normalizeError(cause);

  if (isCanceled(error)) {
    return error;
  }

  const context = options.context ?? 'app';

  errorLog.log(error, context, cause);

  if (options.silent === true) {
    return error;
  }

  const report: ErrorReport = { error, context };

  if (options.retry) {
    report.retry = options.retry;
  }

  for (const sink of errorSinks) {
    try {
      sink(report);
    } catch (sinkError) {
      errorLog.log(normalizeError(sinkError), 'error-sink', sinkError);
    }
  }

  return error;
}

export interface GlobalErrorHandlerOptions {
  onReport?: (report: ErrorReport) => void;
}

let globalHandlersInstalled = false;

function handleWindowError(event: ErrorEvent): void {
  reportError(event.error ?? event.message, { context: 'window:error' });
}

function handleUnhandledRejection(event: PromiseRejectionEvent): void {
  reportError(event.reason, { context: 'window:unhandledrejection' });
}

/**
 * Catches unhandled errors from Vue, the window, and failed promises.
 * Call once from a Quasar boot file.
 */
export function installGlobalErrorHandler(app: App, options: GlobalErrorHandlerOptions = {}): void {
  if (options.onReport) {
    subscribeToErrorReports(options.onReport);
  }

  app.config.errorHandler = (
    cause: unknown,
    _instance: ComponentPublicInstance | null,
    info: string,
  ): void => {
    reportError(cause, { context: `vue:${info}` });
  };

  if (globalHandlersInstalled || typeof window === 'undefined') {
    return;
  }

  globalHandlersInstalled = true;
  window.addEventListener('error', handleWindowError);
  window.addEventListener('unhandledrejection', handleUnhandledRejection);
}

function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted === true) {
    throw new CanceledException();
  }
}

function wait(milliseconds: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted === true) {
      reject(new CanceledException());
      return;
    }

    const timer = setTimeout(() => {
      cleanup();
      resolve();
    }, milliseconds);

    function onAbort(): void {
      clearTimeout(timer);
      cleanup();
      reject(new CanceledException());
    }

    function cleanup(): void {
      signal?.removeEventListener('abort', onAbort);
    }

    signal?.addEventListener('abort', onAbort, { once: true });
  });
}
