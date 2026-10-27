import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { App } from 'vue';
import type { ZodIssue } from 'zod';
import { ZodError } from 'zod';
import type { AppError } from '@/types';
import {
  AppException,
  BusinessException,
  CANCELED_MESSAGE,
  CanceledException,
  DEFAULT_RETRY_ATTEMPTS,
  NetworkException,
  NotFoundException,
  StorageException,
  UnexpectedException,
  ValidationException,
  createErrorLogger,
  errorLog,
  installGlobalErrorHandler,
  isAppError,
  isCanceled,
  isRetryable,
  normalizeError,
  registerErrorStrategy,
  reportError,
  sanitizeUserMessage,
  subscribeToErrorReports,
  toUserMessage,
  withRetry,
  type ErrorStrategy,
} from '@/utils/errorHandling';

function network(error: AppError = { kind: 'network', message: 'Нет связи', retryable: true }) {
  return error;
}

describe('domain exceptions', () => {
  it('stores kind, code, status, retryable and cause', () => {
    const cause = new Error('socket');
    const exception = new NetworkException('Нет связи', 503, { code: 'unavailable', cause });

    expect(exception).toBeInstanceOf(AppException);
    expect(exception).toBeInstanceOf(Error);
    expect(exception.name).toBe('NetworkException');
    expect(exception.kind).toBe('network');
    expect(exception.code).toBe('unavailable');
    expect(exception.status).toBe(503);
    expect(exception.retryable).toBe(true);
    expect(exception.cause).toBe(cause);
  });

  it('uses the kind as the default code', () => {
    expect(new BusinessException('Нельзя').code).toBe('business');
    expect(new StorageException('Нет места').code).toBe('storage');
    expect(new NotFoundException('Нет записи').code).toBe('not_found');
  });

  it('defaults retryable flags for network, unexpected and canceled errors', () => {
    expect(new NetworkException('Сеть').retryable).toBe(true);
    expect(new UnexpectedException().retryable).toBe(false);
    expect(new CanceledException().retryable).toBe(false);
    expect(new CanceledException().message).toBe(CANCELED_MESSAGE);
  });
});

describe('error predicates', () => {
  it('recognises AppError objects', () => {
    expect(isAppError(network())).toBe(true);
    expect(isAppError({ kind: 'unknown', message: 'x' })).toBe(false);
    expect(isAppError({ kind: 'network' })).toBe(false);
    expect(isAppError(null)).toBe(false);
    expect(isAppError('network')).toBe(false);
  });

  it('recognises canceled errors regardless of their source', () => {
    expect(isCanceled(new CanceledException())).toBe(true);
    expect(isCanceled(new AppException('Отмена', 'network', { code: 'canceled' }))).toBe(true);
    expect(isCanceled({ kind: 'network', code: 'canceled', message: CANCELED_MESSAGE })).toBe(true);
    expect(isCanceled(network())).toBe(false);
    expect(isCanceled(new Error('boom'))).toBe(false);
  });

  it('reads the retryable flag', () => {
    expect(isRetryable(network())).toBe(true);
    expect(isRetryable({ kind: 'business', message: 'Нет' })).toBe(false);
  });
});

describe('user-facing messages', () => {
  it.each([
    ['  Понятная ошибка  ', 'Понятная ошибка'],
    ['Ошибка валидации', 'Ошибка валидации'],
    ['Запись не найдена', 'Запись не найдена'],
  ])('keeps safe message "%s"', (input, expected) => {
    expect(sanitizeUserMessage(input)).toBe(expected);
  });

  it.each([
    ['', 'empty'],
    ['a'.repeat(161), 'too long'],
    ['bad\u0000message', 'control character'],
    ['<b>html</b>', 'html'],
    ['Failed to fetch', 'network detail'],
    ['NetworkError when attempting', 'network class'],
    ['ECONNREFUSED 127.0.0.1', 'errno'],
    ['Error: something', 'error prefix'],
    ['TypeError: x is undefined', 'type error prefix'],
    [' at foo (file.js:1:1)', 'stack frame'],
    ['errorMessage: boom', 'serialized field'],
    ['value [object Object]', 'object'],
  ])('hides technical message "%s" (%s)', (input) => {
    expect(sanitizeUserMessage(input)).toBeNull();
  });

  it('rejects non-string values', () => {
    expect(sanitizeUserMessage(undefined)).toBeNull();
    expect(sanitizeUserMessage(42)).toBeNull();
  });

  it('returns CANCELED_MESSAGE for canceled errors', () => {
    expect(toUserMessage({ kind: 'network', code: 'canceled', message: 'boom' })).toBe(
      CANCELED_MESSAGE,
    );
  });

  it('replaces technical messages with kind-specific fallbacks', () => {
    expect(toUserMessage({ kind: 'network', message: 'Failed to fetch' })).toBe(
      'Нет связи с сервером. Проверьте подключение и попробуйте ещё раз',
    );
    expect(toUserMessage({ kind: 'validation', field: 'form', message: '<b>bad</b>' })).toBe(
      'Проверьте введённые данные',
    );
    expect(toUserMessage({ kind: 'not_found', id: 1, message: 'Failed to fetch' })).toBe(
      'Запись не найдена',
    );
    expect(toUserMessage({ kind: 'storage', message: 'ошибка' })).toBe('ошибка');
    expect(toUserMessage({ kind: 'business', message: 'Error: x' })).toBe(
      'Не удалось выполнить действие',
    );
    expect(toUserMessage({ kind: 'unexpected', message: 'at foo' })).toBe(
      'Что-то пошло не так. Попробуйте позже',
    );
  });
});

describe('normalizeError', () => {
  it('passes through an existing AppError', () => {
    const error = network();

    expect(normalizeError(error)).toBe(error);
  });

  it('normalizes canceled sources', () => {
    const abort = new Error('aborted');
    abort.name = 'AbortError';

    expect(normalizeError(new CanceledException())).toMatchObject({
      kind: 'network',
      code: 'canceled',
      retryable: false,
      message: CANCELED_MESSAGE,
    });
    expect(normalizeError(abort)).toMatchObject({ code: 'canceled', retryable: false });
  });

  it('converts validation exceptions and keeps the field', () => {
    expect(normalizeError(new ValidationException('Плохой email', 'email'))).toEqual({
      kind: 'validation',
      field: 'email',
      message: 'Плохой email',
      code: 'validation',
    });

    expect(normalizeError(new AppException('Плохо', 'validation'))).toMatchObject({
      kind: 'validation',
      field: 'form',
    });
  });

  it('converts every domain exception into the matching AppError shape', () => {
    expect(normalizeError(new NotFoundException('Нет задачи', { code: 'missing' }))).toEqual({
      kind: 'not_found',
      id: 0,
      message: 'Нет задачи',
      code: 'missing',
    });

    expect(normalizeError(new StorageException('Нет места'))).toEqual({
      kind: 'storage',
      message: 'Нет места',
      code: 'storage',
    });

    expect(normalizeError(new BusinessException('Нельзя'))).toEqual({
      kind: 'business',
      message: 'Нельзя',
      code: 'business',
    });

    expect(
      normalizeError(new UnexpectedException('Странно', { code: 'weird', retryable: true })),
    ).toEqual({
      kind: 'unexpected',
      message: 'Странно',
      code: 'weird',
      retryable: true,
    });

    expect(normalizeError(new NetworkException('Сеть', 502, { code: 'bad-gateway' }))).toEqual({
      kind: 'network',
      message: 'Сеть',
      code: 'bad-gateway',
      retryable: true,
      status: 502,
    });
  });

  it('sanitizes messages of domain exceptions before exposing them', () => {
    expect(normalizeError(new BusinessException('Failed to fetch'))).toMatchObject({
      kind: 'business',
      message: 'Не удалось выполнить действие',
    });
  });

  it('converts ZodError issues into a validation AppError', () => {
    const issues = [
      { code: 'custom', path: ['email'], message: 'Плохой email' },
    ] as unknown as ZodIssue[];

    expect(normalizeError(new ZodError(issues))).toEqual({
      kind: 'validation',
      field: 'email',
      message: 'Плохой email',
      code: 'custom',
    });
  });

  it('maps unknown Zod paths to form and uses defaults without issues', () => {
    const unknown = [
      { code: 'custom', path: ['profile', 'email'], message: 'Плохо' },
    ] as unknown as ZodIssue[];

    expect(normalizeError(new ZodError(unknown))).toMatchObject({
      kind: 'validation',
      field: 'form',
      message: 'Плохо',
    });
    expect(normalizeError(new ZodError([]))).toMatchObject({
      kind: 'validation',
      field: 'form',
      code: 'validation',
    });
  });

  it('falls back to an unexpected error for unknown causes', () => {
    expect(normalizeError('boom')).toEqual({
      kind: 'unexpected',
      code: 'unexpected',
      retryable: false,
      message: 'Что-то пошло не так. Попробуйте позже',
    });
  });

  it('allows custom strategies to be registered', () => {
    const sentinel = { customFailure: true };
    const strategy: ErrorStrategy = {
      name: 'custom',
      matches: (cause) => cause === sentinel,
      toAppError: () => ({ kind: 'business', message: 'Своя ошибка', code: 'custom' }),
    };

    registerErrorStrategy(strategy, true);

    expect(normalizeError(sentinel)).toMatchObject({ kind: 'business', message: 'Своя ошибка' });
  });
});

describe('createErrorLogger', () => {
  it('stores entries with user and technical details', () => {
    const logger = createErrorLogger();
    const cause = new Error('socket closed');

    const entry = logger.log(network(), 'todo', cause);

    expect(entry).toMatchObject({
      context: 'todo',
      kind: 'network',
      code: 'network',
      message: 'Нет связи',
      technical: 'socket closed',
    });
    expect(entry.at).toEqual(expect.any(String));
    expect(entry.stack).toContain('socket closed');
    expect(logger.entries()).toEqual([entry]);
  });

  it('describes non-Error causes safely', () => {
    const logger = createErrorLogger();

    expect(logger.log(network(), 'ctx', { a: 1 }).technical).toBe('{"a":1}');
    expect(logger.log(network(), 'ctx', 'plain').technical).toBe('plain');

    const circular: Record<string, unknown> = {};
    circular.self = circular;

    expect(logger.log(network(), 'ctx', circular).technical).toBe('[object Object]');
  });

  it('respects capacity and can be cleared', () => {
    const logger = createErrorLogger({ capacity: 2 });

    logger.log({ kind: 'business', message: 'Первая' }, 'a');
    logger.log({ kind: 'business', message: 'Вторая' }, 'b');
    logger.log({ kind: 'business', message: 'Третья' }, 'c');

    expect(logger.entries()).toHaveLength(2);
    expect(logger.entries().map((entry) => entry.message)).toEqual(['Вторая', 'Третья']);

    logger.clear();

    expect(logger.entries()).toHaveLength(0);
  });

  it('writes to the console only when explicitly enabled', () => {
    const consoleError = vi.mocked(console.error);
    const logger = createErrorLogger({ console: true });

    logger.log(network(), 'ctx');

    expect(consoleError).toHaveBeenCalledOnce();

    consoleError.mockClear();
    createErrorLogger().log(network(), 'ctx');

    expect(consoleError).not.toHaveBeenCalled();
  });
});

describe('reportError', () => {
  beforeEach(() => {
    errorLog.clear();
  });

  it('logs the error and notifies subscribers with context and retry', () => {
    const sink = vi.fn();
    const retry = vi.fn();
    const unsubscribe = subscribeToErrorReports(sink);

    const error = reportError(new NetworkException('Нет связи'), {
      context: 'todo',
      retry,
    });

    expect(error).toMatchObject({ kind: 'network', message: 'Нет связи' });
    expect(sink).toHaveBeenCalledWith({ error, context: 'todo', retry });
    expect(errorLog.entries()).toHaveLength(1);

    unsubscribe();
  });

  it('does not notify subscribers in silent mode but still logs', () => {
    const sink = vi.fn();
    const unsubscribe = subscribeToErrorReports(sink);

    reportError(new BusinessException('Нет прав'), { context: 'auth', silent: true });

    expect(sink).not.toHaveBeenCalled();
    expect(errorLog.entries()).toHaveLength(1);

    unsubscribe();
  });

  it('ignores canceled errors completely', () => {
    const sink = vi.fn();
    const unsubscribe = subscribeToErrorReports(sink);

    expect(reportError(new CanceledException())).toMatchObject({ code: 'canceled' });
    expect(sink).not.toHaveBeenCalled();
    expect(errorLog.entries()).toHaveLength(0);

    unsubscribe();
  });

  it('does not let a broken subscriber break the pipeline', () => {
    const failing = vi.fn(() => {
      throw new Error('sink failed');
    });
    const healthy = vi.fn();
    const unsubscribeFailing = subscribeToErrorReports(failing);
    const unsubscribeHealthy = subscribeToErrorReports(healthy);
    const consoleError = vi.mocked(console.error);

    reportError(new BusinessException('Ошибка'), { context: 'ctx' });

    expect(healthy).toHaveBeenCalledOnce();
    expect(errorLog.entries().some((entry) => entry.context === 'error-sink')).toBe(true);
    expect(consoleError).toHaveBeenCalled();

    unsubscribeFailing();
    unsubscribeHealthy();
  });
});

describe('withRetry', () => {
  it('retries retryable failures with exponential delays', async () => {
    const onRetry = vi.fn();
    const task = vi.fn(async (attempt: number) => {
      if (attempt < 3) {
        throw network();
      }

      return 'ok';
    });

    await expect(
      withRetry(task, { attempts: 3, baseDelayMs: 0, maxDelayMs: 0, onRetry }),
    ).resolves.toBe('ok');

    expect(task).toHaveBeenCalledTimes(3);
    expect(onRetry).toHaveBeenCalledTimes(2);
    expect(onRetry).toHaveBeenNthCalledWith(1, {
      attempt: 1,
      attempts: 3,
      delay: 0,
      error: network(),
    });
    expect(DEFAULT_RETRY_ATTEMPTS).toBe(3);
  });

  it('gives up after the configured number of attempts', async () => {
    const task = vi.fn(async () => {
      throw network();
    });

    await expect(withRetry(task, { attempts: 2, baseDelayMs: 0 })).rejects.toEqual(network());
    expect(task).toHaveBeenCalledTimes(2);
  });

  it('stops immediately when shouldRetry returns false', async () => {
    const task = vi.fn(async () => {
      throw new BusinessException('Нет');
    });

    await expect(
      withRetry(task, { attempts: 3, baseDelayMs: 0, shouldRetry: () => false }),
    ).rejects.toBeInstanceOf(BusinessException);
    expect(task).toHaveBeenCalledTimes(1);
  });

  it('does not start a task with an already aborted signal', async () => {
    const controller = new AbortController();
    controller.abort();
    const task = vi.fn(async () => 'ok');

    await expect(withRetry(task, { signal: controller.signal })).rejects.toBeInstanceOf(
      CanceledException,
    );
    expect(task).not.toHaveBeenCalled();
  });
});

describe('installGlobalErrorHandler', () => {
  afterEach(() => {
    errorLog.clear();
  });

  it('routes Vue and window errors to the common pipeline', () => {
    const onReport = vi.fn();
    const app = { config: {} } as unknown as App;

    installGlobalErrorHandler(app, { onReport });
    app.config.errorHandler?.(new Error('render failed'), null, 'render');

    expect(onReport).toHaveBeenCalledWith({
      error: expect.objectContaining({ kind: 'unexpected' }),
      context: 'vue:render',
    });

    window.dispatchEvent(new ErrorEvent('error', { error: new Error('window failed') }));

    expect(onReport).toHaveBeenCalledWith(expect.objectContaining({ context: 'window:error' }));
  });
});
