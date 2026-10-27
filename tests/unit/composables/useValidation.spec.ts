import { flushPromises } from '@vue/test-utils';
import { effectScope, nextTick, type EffectScope } from 'vue';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  useValidation,
  type FormValues,
  type UseValidationOptions,
  type ValidationForm,
} from '@/composables/useValidation';
import { NetworkException, ValidationException } from '@/utils/errorHandling';
import {
  registerSchema,
  todoFormSchema,
  validationMessages,
  type RegisterValues,
  type TodoFormValues,
} from '@/utils/validation';
import type { AppError } from '@/types';
import { deferred } from '../../mocks/api';

const scopes: EffectScope[] = [];

function createForm<TValues extends FormValues>(
  options: UseValidationOptions<TValues>,
): ValidationForm<TValues> {
  const scope = effectScope();
  const form = scope.run(() => useValidation(options));

  scopes.push(scope);

  if (!form) {
    throw new Error('Effect scope did not create the form');
  }

  return form;
}

function todoForm(overrides: Partial<UseValidationOptions<TodoFormValues>> = {}) {
  return createForm<TodoFormValues>({
    schema: todoFormSchema,
    initialValues: { title: '' },
    validateOnInput: false,
    ...overrides,
  });
}

function registerForm(
  overrides: Partial<UseValidationOptions<RegisterValues>> = {},
): ValidationForm<RegisterValues> {
  return createForm<RegisterValues>({
    schema: registerSchema,
    initialValues: {
      name: 'Мария',
      email: 'maria@example.com',
      password: 'secret',
      passwordConfirm: 'secret',
    },
    validateOnInput: false,
    ...overrides,
  });
}

afterEach(() => {
  for (const scope of scopes.splice(0)) {
    scope.stop();
  }
});

describe('initial state', () => {
  it('exposes values, empty errors and flags', () => {
    const form = todoForm();

    expect(form.values.title).toBe('');
    expect(form.errors.value).toEqual({});
    expect(form.touched.value).toEqual({});
    expect(form.formError.value).toBe('');
    expect(form.isSubmitting.value).toBe(false);
    expect(form.isValidating.value).toBe(false);
    expect(form.isValid.value).toBe(true);
    expect(form.firstError.value).toBe('');
    expect(form.hasError('title')).toBe(false);
    expect(form.fieldError('title')).toBe('');
    expect(form.isPending('title')).toBe(false);
  });
});

describe('synchronous validation', () => {
  it('rejects an empty title on validateAll', async () => {
    const form = todoForm();

    await expect(form.validateAll()).resolves.toBe(false);

    expect(form.errors.value).toEqual({ title: validationMessages.titleRequired });
    expect(form.firstError.value).toBe(validationMessages.titleRequired);
    expect(form.hasError('title')).toBe(true);
    expect(form.fieldError('title')).toBe(validationMessages.titleRequired);
    expect(form.isValid.value).toBe(false);
  });

  it('accepts a valid title and trims it', async () => {
    const form = todoForm();
    form.values.title = '  Купить хлеб  ';

    await expect(form.validateAll()).resolves.toBe(true);

    expect(form.errors.value).toEqual({});
    expect(form.isValid.value).toBe(true);
  });

  it('validates a single field on demand', async () => {
    const form = todoForm();

    await expect(form.validateField('title')).resolves.toBe(false);
    expect(form.fieldError('title')).toBe(validationMessages.titleRequired);

    form.values.title = 'Купить хлеб';

    await expect(form.validateField('title')).resolves.toBe(true);
    expect(form.hasError('title')).toBe(false);
  });

  it('marks a field as touched and revalidates it', async () => {
    const form = todoForm();

    form.touch('title');
    await flushPromises();

    expect(form.touched.value.title).toBe(true);
    expect(form.hasError('title')).toBe(true);

    form.values.title = 'Готовая задача';
    await form.validateField('title');

    expect(form.hasError('title')).toBe(false);
  });

  it('revalidates while typing after the configured debounce', async () => {
    vi.useFakeTimers();

    const form = todoForm({ debounceMs: 50, validateOnInput: true });

    form.values.title = 'Купить  хлеб';
    await nextTick();

    expect(form.hasError('title')).toBe(false);

    await vi.advanceTimersByTimeAsync(49);
    expect(form.hasError('title')).toBe(false);

    await vi.advanceTimersByTimeAsync(1);

    expect(form.hasError('title')).toBe(true);
    expect(form.fieldError('title')).toBe(validationMessages.titleSpaces);
  });

  it('does not schedule validation when validateOnInput is false', async () => {
    vi.useFakeTimers();

    const form = todoForm({ debounceMs: 10, validateOnInput: false });

    form.values.title = 'Купить  хлеб';
    await nextTick();
    await vi.advanceTimersByTimeAsync(50);

    expect(form.hasError('title')).toBe(false);
  });

  it('cancels pending debounce timers on reset', async () => {
    vi.useFakeTimers();

    const form = todoForm({ debounceMs: 50, validateOnInput: true });

    form.values.title = 'Купить  хлеб';
    await nextTick();
    form.reset();
    await vi.advanceTimersByTimeAsync(100);

    expect(form.hasError('title')).toBe(false);
    expect(form.values.title).toBe('');
  });
});

describe('submit', () => {
  it('submits parsed values and returns true', async () => {
    const handler = vi.fn();
    const form = todoForm({ onSubmit: handler });

    form.values.title = '  Купить хлеб  ';

    await expect(form.submit()).resolves.toBe(true);

    expect(handler).toHaveBeenCalledWith({ title: 'Купить хлеб' });
    expect(form.isSubmitting.value).toBe(false);
  });

  it('supports a handler passed directly to submit', async () => {
    const handler = vi.fn();
    const form = todoForm();
    form.values.title = 'Новая задача';

    await expect(form.submit(handler)).resolves.toBe(true);

    expect(handler).toHaveBeenCalledWith({ title: 'Новая задача' });
  });

  it('does not call the handler when validation fails', async () => {
    const handler = vi.fn();
    const form = todoForm();

    await expect(form.submit(handler)).resolves.toBe(false);

    expect(handler).not.toHaveBeenCalled();
    expect(form.hasError('title')).toBe(true);
  });

  it('returns true without a handler when data is valid', async () => {
    const form = todoForm();
    form.values.title = 'Новая задача';

    await expect(form.submit()).resolves.toBe(true);
  });

  it('turns a thrown domain error into a form error', async () => {
    const form = todoForm();
    form.values.title = 'Новая задача';

    const result = await form.submit(async () => {
      throw new NetworkException('Сервер временно недоступен. Попробуйте ещё раз');
    });

    expect(result).toBe(false);
    expect(form.formError.value).toBe('Сервер временно недоступен. Попробуйте ещё раз');
    expect(form.isValid.value).toBe(false);
    expect(form.firstError.value).toBe('Сервер временно недоступен. Попробуйте ещё раз');
    expect(form.isSubmitting.value).toBe(false);
  });

  it('hides technical details of a thrown error', async () => {
    const form = todoForm();
    form.values.title = 'Новая задача';

    await form.submit(async () => {
      throw new Error('Failed to fetch');
    });

    expect(form.formError.value).toBe('Что-то пошло не так. Попробуйте позже');
  });

  it('prevents a second submit while the first one is running', async () => {
    const pending = deferred<void>();
    const handler = vi.fn(() => pending.promise);
    const form = todoForm();
    form.values.title = 'Новая задача';

    const first = form.submit(handler);
    await flushPromises();

    expect(form.isSubmitting.value).toBe(true);
    await expect(form.submit(handler)).resolves.toBe(false);
    expect(handler).toHaveBeenCalledTimes(1);

    pending.resolve();
    await expect(first).resolves.toBe(true);
    expect(form.isSubmitting.value).toBe(false);
  });
});

describe('server errors', () => {
  it('applies a field validation error', () => {
    const form = todoForm();

    form.applyServerError({
      kind: 'validation',
      field: 'title',
      message: 'Название уже занято',
      code: 'duplicate',
    });

    expect(form.touched.value.title).toBe(true);
    expect(form.fieldError('title')).toBe('Название уже занято');
    expect(form.formError.value).toBe('');
  });

  it('applies a form-level error for unknown fields', () => {
    const form = todoForm();

    form.applyServerError({
      kind: 'validation',
      field: 'email',
      message: 'Проверьте email',
      code: 'validation',
    });

    expect(form.formError.value).toBe('Проверьте email');
    expect(form.hasError('title')).toBe(false);
  });

  it('applies non-validation errors as a form message and clears it with null', () => {
    const form = todoForm();

    form.applyServerError({ kind: 'network', message: 'Нет связи', retryable: true });

    expect(form.formError.value).toBe('Нет связи');
    expect(form.isValid.value).toBe(false);

    form.applyServerError(null);

    expect(form.formError.value).toBe('');
    expect(form.isValid.value).toBe(true);
  });

  it('gives a form error priority over field errors in firstError', async () => {
    const form = todoForm();

    await form.validateAll();
    form.formError.value = 'Общая ошибка';

    expect(form.firstError.value).toBe('Общая ошибка');
  });
});

describe('reset', () => {
  it('restores initial values and clears all state', async () => {
    const form = todoForm({ initialValues: { title: 'Начальное' } });

    form.values.title = '';
    form.touch('title');
    await form.validateAll();
    form.formError.value = 'Ошибка';

    form.reset();
    await nextTick();

    expect(form.values.title).toBe('Начальное');
    expect(form.errors.value).toEqual({});
    expect(form.touched.value).toEqual({});
    expect(form.formError.value).toBe('');
    expect(form.isValid.value).toBe(true);
  });

  it('accepts a partial next state', async () => {
    const form = todoForm();

    form.reset({ title: 'Следующая задача' });
    await nextTick();

    expect(form.values.title).toBe('Следующая задача');
  });
});

describe('async validation', () => {
  it('runs async rules after synchronous validation succeeds', async () => {
    const check = vi.fn<(value: string) => Promise<true>>().mockResolvedValue(true);
    const form = registerForm({
      asyncRules: {
        email: async (value) => (await check(value)) || validationMessages.emailTaken,
      },
    });

    await expect(form.validateAll()).resolves.toBe(true);

    expect(check).toHaveBeenCalledWith('maria@example.com');
    expect(form.hasError('email')).toBe(false);
  });

  it('does not run async rules when the schema already failed', async () => {
    const check = vi.fn(async (): Promise<true> => true);
    const form = createForm<RegisterValues>({
      schema: registerSchema,
      initialValues: {
        name: 'Мария',
        email: 'not-an-email',
        password: 'secret',
        passwordConfirm: 'secret',
      },
      asyncRules: { email: check },
      validateOnInput: false,
    });

    await expect(form.validateAll()).resolves.toBe(false);

    expect(check).not.toHaveBeenCalled();
    expect(form.hasError('email')).toBe(true);
  });

  it('shows an async validation error', async () => {
    const form = registerForm({
      asyncRules: {
        email: async () => validationMessages.emailTaken,
      },
    });

    await expect(form.validateAll()).resolves.toBe(false);

    expect(form.fieldError('email')).toBe(validationMessages.emailTaken);
    expect(form.isValid.value).toBe(false);
  });

  it('does not block the form when an async check fails', async () => {
    const form = registerForm({
      asyncRules: {
        email: async () => {
          throw new Error('Failed to fetch');
        },
      },
    });

    await expect(form.validateAll()).resolves.toBe(true);

    expect(form.hasError('email')).toBe(false);
  });

  it('reuses cached async results for field validation', async () => {
    const check = vi.fn(async (): Promise<true> => true);
    const form = registerForm({ asyncRules: { email: check } });

    await form.validateField('email');
    await form.validateField('email');

    expect(check).toHaveBeenCalledTimes(1);
  });

  it('rechecks async rules from scratch on full validation', async () => {
    const check = vi.fn(async (): Promise<true> => true);
    const form = registerForm({ asyncRules: { email: check } });

    await form.validateAll();
    await form.validateAll();

    expect(check).toHaveBeenCalledTimes(2);
  });

  it('exposes pending state while an async rule is running', async () => {
    const pending = deferred<string | true>();
    const form = registerForm({ asyncRules: { email: () => pending.promise } });

    const validation = form.validateField('email');

    expect(form.isPending('email')).toBe(true);
    expect(form.isValidating.value).toBe(true);

    pending.resolve(true);
    await expect(validation).resolves.toBe(true);

    expect(form.isPending('email')).toBe(false);
    expect(form.isValidating.value).toBe(false);
  });

  it('ignores an outdated async result when the value changed', async () => {
    const first = deferred<string | true>();
    const second = deferred<string | true>();
    const rule = vi
      .fn<(value: string) => Promise<string | true>>()
      .mockReturnValueOnce(first.promise)
      .mockReturnValueOnce(second.promise);
    const form = registerForm({ asyncRules: { email: rule } });

    const firstValidation = form.validateField('email');
    form.values.email = 'other@example.com';
    const secondValidation = form.validateField('email');

    first.resolve('Старое значение занято');
    await expect(firstValidation).resolves.toBe(true);
    expect(form.hasError('email')).toBe(false);

    second.resolve(true);
    await secondValidation;
    expect(form.hasError('email')).toBe(false);
  });

  it('treats an outdated failure as non-blocking', async () => {
    const first = deferred<string | true>();
    const second = deferred<string | true>();
    const rule = vi
      .fn<(value: string) => Promise<string | true>>()
      .mockReturnValueOnce(first.promise)
      .mockReturnValueOnce(second.promise);
    const form = registerForm({ asyncRules: { email: rule } });

    const firstValidation = form.validateField('email');
    form.values.email = 'other@example.com';
    const secondValidation = form.validateField('email');

    first.reject(new Error('late failure'));
    await expect(firstValidation).resolves.toBe(true);

    second.resolve(true);
    await expect(secondValidation).resolves.toBe(true);
  });

  it('does not run async rules for empty values', async () => {
    const check = vi.fn(async (): Promise<true> => true);
    const form = registerForm({
      asyncRules: { email: check },
      validateOnInput: false,
    });
    form.values.email = '';

    // The sync schema rejects the empty email, so the async request is skipped.
    await expect(form.validateAll()).resolves.toBe(false);

    expect(check).not.toHaveBeenCalled();
    expect(form.hasError('email')).toBe(true);
  });
});

describe('touched visibility', () => {
  it('keeps untouched empty fields hidden during partial validation', async () => {
    const form = registerForm({
      initialValues: {
        name: '',
        email: 'maria@example.com',
        password: 'secret',
        passwordConfirm: 'secret',
      },
    });

    await form.validateField('email');

    expect(form.hasError('name')).toBe(false);
    expect(form.hasError('email')).toBe(false);
  });

  it('accepts a server validation exception object through the public API', () => {
    const form = todoForm();
    const exception = new ValidationException('Серверное значение', 'title');

    form.applyServerError(exception as unknown as AppError);

    expect(form.fieldError('title')).toBe('Серверное значение');
  });
});
