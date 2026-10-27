import {
  computed,
  nextTick,
  onScopeDispose,
  reactive,
  ref,
  watch,
  type ComputedRef,
  type Ref,
} from 'vue';
import type { ZodType } from 'zod';
import { reportError, toUserMessage } from '@/utils/errorHandling';
import {
  firstFieldError,
  validateWithSchema,
  type AsyncValidationRule,
  type FieldErrors,
  type ValidationResult,
} from '@/utils/validation';
import type { AppError } from '@/types/api';

export type FormValues = Record<string, string | number | boolean>;

export type SubmitHandler<TValues extends FormValues> = (values: TValues) => void | Promise<void>;

export interface UseValidationOptions<TValues extends FormValues> {
  /** The single schema that defines every rule for this form. */
  schema: ZodType<TValues>;
  initialValues: TValues;
  /** Async rules (for example email uniqueness) run after sync validation passes. */
  asyncRules?: Partial<Record<Extract<keyof TValues, string>, AsyncValidationRule>>;
  /** Debounce before revalidating while the user types. */
  debounceMs?: number;
  /** Set to false to validate only on blur and submit. */
  validateOnInput?: boolean;
  onSubmit?: SubmitHandler<TValues>;
}

export interface ValidationForm<TValues extends FormValues> {
  values: TValues;
  errors: ComputedRef<FieldErrors>;
  touched: Ref<Partial<Record<keyof TValues, boolean>>>;
  formError: Ref<string>;
  isSubmitting: Ref<boolean>;
  isValidating: ComputedRef<boolean>;
  isValid: ComputedRef<boolean>;
  firstError: ComputedRef<string>;
  hasError: (field: keyof TValues) => boolean;
  fieldError: (field: keyof TValues) => string;
  isPending: (field: keyof TValues) => boolean;
  touch: (field: keyof TValues) => void;
  validateField: (field: keyof TValues) => Promise<boolean>;
  validateAll: () => Promise<boolean>;
  submit: (handler?: SubmitHandler<TValues>) => Promise<boolean>;
  reset: (nextValues?: Partial<TValues>) => void;
  applyServerError: (error: AppError | null) => void;
}

/**
 * Form state with real-time validation and async checks.
 *
 * All rules live in one Zod schema, so `hasError` / `fieldError` only expose
 * the schema result and never duplicate any constraints.
 */
export function useValidation<TValues extends FormValues>(
  options: UseValidationOptions<TValues>,
): ValidationForm<TValues> {
  const debounceMs = Math.max(0, options.debounceMs ?? 250);
  const validateOnInput = options.validateOnInput !== false;
  const fieldNames = Object.keys(options.initialValues) as Extract<keyof TValues, string>[];
  const asyncRules: Partial<Record<string, AsyncValidationRule>> = options.asyncRules ?? {};
  const asyncFields = Object.keys(asyncRules) as Extract<keyof TValues, string>[];

  const values = reactive({ ...options.initialValues }) as TValues;
  const touched = ref<Partial<Record<keyof TValues, boolean>>>({}) as Ref<
    Partial<Record<keyof TValues, boolean>>
  >;
  const syncErrors = ref<FieldErrors>({});
  const asyncErrors = ref<FieldErrors>({});
  const formError = ref('');
  const isSubmitting = ref(false);
  const pendingFields = ref(new Set<string>());
  const timers = new Map<string, ReturnType<typeof setTimeout>>();
  const asyncCache = new Map<string, string | true>();
  const asyncTokens = new Map<string, number>();
  let submitted = false;
  let resetting = false;
  let validData: TValues | null = null;

  const errors = computed((): FieldErrors => ({ ...syncErrors.value, ...asyncErrors.value }));

  const isValidating = computed((): boolean => pendingFields.value.size > 0);

  const isValid = computed(
    (): boolean => Object.keys(errors.value).length === 0 && formError.value.trim().length === 0,
  );

  const firstError = computed((): string => {
    if (formError.value.trim().length > 0) {
      return formError.value;
    }

    return firstFieldError(errors.value, fieldNames)?.[1] ?? '';
  });

  function fieldValue(field: string): unknown {
    return (values as Record<string, unknown>)[field];
  }

  function hasValue(field: string): boolean {
    const value = fieldValue(field);

    if (typeof value === 'string') {
      return value.trim().length > 0;
    }

    return value !== undefined && value !== null;
  }

  function shouldShow(field: string): boolean {
    return submitted || touched.value[field as keyof TValues] === true || hasValue(field);
  }

  function collectVisibleErrors(
    result: ValidationResult<TValues>,
    only?: readonly string[],
  ): FieldErrors {
    if (result.ok) {
      return {};
    }

    const visible: FieldErrors = {};

    for (const [field, message] of Object.entries(result.errors)) {
      if (only && !only.includes(field)) {
        continue;
      }

      if (shouldShow(field) || only?.includes(field) === true) {
        visible[field] = message;
      }
    }

    return visible;
  }

  function applySyncErrors(result: ValidationResult<TValues>, only?: readonly string[]): void {
    if (!only) {
      syncErrors.value = collectVisibleErrors(result);
      formError.value = !result.ok ? (result.errors.form ?? '') : '';
      return;
    }

    const next = { ...syncErrors.value };

    for (const field of only) {
      delete next[field];
    }

    syncErrors.value = { ...next, ...collectVisibleErrors(result, only) };

    if (!result.ok && result.errors.form !== undefined) {
      formError.value = result.errors.form;
    } else if (only.includes('form')) {
      formError.value = '';
    }
  }

  function setAsyncError(field: string, result: string | true): void {
    const next = { ...asyncErrors.value };

    if (result === true) {
      delete next[field];
    } else {
      next[field] = result;
    }

    asyncErrors.value = next;
  }

  function clearAsyncError(field: string): void {
    if (asyncErrors.value[field] === undefined) {
      return;
    }

    const next = { ...asyncErrors.value };
    delete next[field];
    asyncErrors.value = next;
  }

  async function runAsyncRule(
    field: string,
    value: string,
    rule: AsyncValidationRule,
  ): Promise<void> {
    const key = `${field}:${value.trim().toLowerCase()}`;
    const cached = asyncCache.get(key);

    if (cached !== undefined) {
      setAsyncError(field, cached);
      return;
    }

    const token = (asyncTokens.get(field) ?? 0) + 1;
    asyncTokens.set(field, token);
    pendingFields.value.add(field);

    try {
      const result = await rule(value);

      asyncCache.set(key, result);

      if (asyncTokens.get(field) !== token) {
        return;
      }

      setAsyncError(field, result);
    } catch (cause) {
      if (asyncTokens.get(field) !== token) {
        return;
      }

      // A failed availability check must not block the form:
      // the server validates the same value again on submit.
      reportError(cause, { context: `validation:${field}`, silent: true });
      clearAsyncError(field);
    } finally {
      if (asyncTokens.get(field) === token) {
        pendingFields.value.delete(field);
      }
    }
  }

  async function runAsyncFields(
    fields: readonly string[],
    mode: 'all' | 'visible',
  ): Promise<boolean> {
    const tasks: Promise<void>[] = [];

    for (const field of fields) {
      const rule = asyncRules[field];
      const value = fieldValue(field);

      if (!rule || typeof value !== 'string' || value.trim().length === 0) {
        continue;
      }

      if (mode === 'visible' && !shouldShow(field)) {
        continue;
      }

      tasks.push(runAsyncRule(field, value, rule));
    }

    if (tasks.length === 0) {
      return Object.keys(asyncErrors.value).length === 0;
    }

    await Promise.all(tasks);

    return Object.keys(asyncErrors.value).length === 0;
  }

  async function validateFields(fields: readonly string[]): Promise<boolean> {
    const result = validateWithSchema(options.schema, values);
    applySyncErrors(result, fields);

    if (!result.ok && fields.some((field) => result.errors[field] !== undefined)) {
      return false;
    }

    const asyncOk = await runAsyncFields(fields, 'visible');

    return asyncOk && fields.every((field) => errors.value[field] === undefined);
  }

  function scheduleValidation(field: string): void {
    const existing = timers.get(field);

    if (existing !== undefined) {
      clearTimeout(existing);
    }

    timers.set(
      field,
      setTimeout(() => {
        timers.delete(field);
        void validateFields([field]);
      }, debounceMs),
    );
  }

  for (const field of fieldNames) {
    watch(
      () => values[field],
      (): void => {
        if (resetting) {
          return;
        }

        clearAsyncError(field);

        if (validateOnInput) {
          scheduleValidation(field);
        }
      },
    );
  }

  onScopeDispose((): void => {
    for (const timer of timers.values()) {
      clearTimeout(timer);
    }

    timers.clear();
  });

  function touch(field: keyof TValues): void {
    touched.value = { ...touched.value, [field]: true };
    void validateFields([String(field)]);
  }

  async function validateField(field: keyof TValues): Promise<boolean> {
    return validateFields([String(field)]);
  }

  async function validateAll(): Promise<boolean> {
    submitted = true;

    const result = validateWithSchema(options.schema, values);
    applySyncErrors(result);

    if (!result.ok) {
      validData = null;
      return false;
    }

    // Re-check every async rule from scratch so cached results cannot hide an error.
    asyncCache.clear();

    const asyncOk = await runAsyncFields(asyncFields, 'all');
    validData = asyncOk ? result.data : null;

    return asyncOk;
  }

  async function submit(handler?: SubmitHandler<TValues>): Promise<boolean> {
    if (isSubmitting.value) {
      return false;
    }

    const valid = await validateAll();

    if (!valid) {
      return false;
    }

    const action = handler ?? options.onSubmit;

    if (!action) {
      return true;
    }

    isSubmitting.value = true;

    try {
      await action(validData ?? values);
      return true;
    } catch (cause) {
      const error = reportError(cause, { context: 'form:submit' });
      formError.value = toUserMessage(error);
      return false;
    } finally {
      isSubmitting.value = false;
    }
  }

  function reset(nextValues?: Partial<TValues>): void {
    resetting = true;

    for (const field of fieldNames) {
      delete (values as Record<string, unknown>)[field];
    }

    Object.assign(values, options.initialValues, nextValues ?? {});
    touched.value = {};
    syncErrors.value = {};
    asyncErrors.value = {};
    formError.value = '';
    asyncCache.clear();
    asyncTokens.clear();
    pendingFields.value.clear();
    submitted = false;
    validData = null;

    for (const timer of timers.values()) {
      clearTimeout(timer);
    }

    timers.clear();

    void nextTick((): void => {
      resetting = false;
    });
  }

  function applyServerError(error: AppError | null): void {
    if (!error) {
      formError.value = '';
      return;
    }

    if (
      error.kind === 'validation' &&
      error.field !== 'form' &&
      fieldNames.includes(error.field as Extract<keyof TValues, string>)
    ) {
      const field = error.field;

      touched.value = { ...touched.value, [field]: true };
      submitted = true;
      syncErrors.value = { ...syncErrors.value, [field]: error.message };
      formError.value = '';
      return;
    }

    formError.value = toUserMessage(error);
  }

  return {
    values,
    errors,
    touched,
    formError,
    isSubmitting,
    isValidating,
    isValid,
    firstError,
    hasError: (field): boolean => errors.value[String(field)] !== undefined,
    fieldError: (field): string => errors.value[String(field)] ?? '',
    isPending: (field): boolean => pendingFields.value.has(String(field)),
    touch,
    validateField,
    validateAll,
    submit,
    reset,
    applyServerError,
  };
}
