import { z, type ZodIssue, type ZodType } from 'zod';
import { validationFields, type ValidationField, type ValidationError } from '@/types/api';

/**
 * Single source of truth for validation rules and messages.
 * Forms, stores, services, and Quasar rules all reuse these schemas,
 * so a rule never has to be duplicated in another layer.
 */

export const validationMessages = {
  required: 'Поле обязательно для заполнения',
  nameRequired: 'Введите имя',
  nameLength: 'Имя должно быть от 2 до 50 символов',
  nameFormat: 'В имени допустимы буквы, цифры, пробел и дефис',
  emailRequired: 'Введите email',
  emailInvalid: 'Введите корректный email',
  emailTooLong: 'Email не длиннее 254 символов',
  emailTaken: 'Этот email уже используется',
  passwordRequired: 'Введите пароль',
  passwordLength: 'Пароль должен быть от 4 до 72 символов',
  passwordConfirmRequired: 'Повторите пароль',
  passwordMismatch: 'Пароли не совпадают',
  titleRequired: 'Введите название задачи',
  titleTooLong: 'Название не длиннее 200 символов',
  titleSpaces: 'Уберите лишние пробелы в названии',
  loginRequired: 'Введите имя или email',
  invalid: 'Проверьте введённые данные',
} as const;

const NAME_PATTERN = /^[\p{L}\p{N}][\p{L}\p{N}\s-]*$/u;
const MAX_EMAIL_LENGTH = 254;
const MAX_TITLE_LENGTH = 200;
const MIN_PASSWORD_LENGTH = 4;
const MAX_PASSWORD_LENGTH = 72;

export type FieldErrors = Record<string, string>;

/** A reusable custom rule: returns an error message or null when the value is valid. */
export type CustomRule<TValue = string> = (value: TValue) => string | null;

export const customRules = {
  /** Rejects empty or whitespace-only values. */
  notBlank(message: string = validationMessages.required): CustomRule<string> {
    return (value): string | null => (value.trim().length === 0 ? message : null);
  },

  /** Rejects values that do not match the pattern. */
  matches(pattern: RegExp, message: string = validationMessages.invalid): CustomRule<string> {
    return (value): string | null => (pattern.test(value) ? null : message);
  },

  /** Rejects values with more words than the limit. */
  maxWords(limit: number, message: string = validationMessages.invalid): CustomRule<string> {
    return (value): string | null => {
      const words = value
        .trim()
        .split(/\s+/)
        .filter((word) => word.length > 0);

      return words.length > limit ? message : null;
    };
  },

  /** Rejects values that are not in the allowed list. */
  oneOf<TValue extends string>(
    allowed: readonly TValue[],
    message: string = validationMessages.invalid,
  ): CustomRule<string> {
    return (value): string | null => (allowed.includes(value as TValue) ? null : message);
  },
};

export function runRules<TValue>(
  value: TValue,
  rules: readonly CustomRule<TValue>[],
): string | null {
  for (const rule of rules) {
    const message = rule(value);

    if (message !== null) {
      return message;
    }
  }

  return null;
}

export const nameField = z
  .string()
  .trim()
  .min(1, validationMessages.nameRequired)
  .min(2, validationMessages.nameLength)
  .max(50, validationMessages.nameLength)
  .refine(
    (value) => customRules.matches(NAME_PATTERN, validationMessages.nameFormat)(value) === null,
    validationMessages.nameFormat,
  );

export const emailField = z
  .string()
  .trim()
  .min(1, validationMessages.emailRequired)
  .max(MAX_EMAIL_LENGTH, validationMessages.emailTooLong)
  .email(validationMessages.emailInvalid);

export const passwordField = z
  .string()
  .min(MIN_PASSWORD_LENGTH, validationMessages.passwordLength)
  .max(MAX_PASSWORD_LENGTH, validationMessages.passwordLength);

export const passwordConfirmField = z
  .string()
  .min(1, validationMessages.passwordConfirmRequired)
  .max(MAX_PASSWORD_LENGTH, validationMessages.passwordLength);

export const taskTitleField = z
  .string()
  .trim()
  .min(1, validationMessages.titleRequired)
  .max(MAX_TITLE_LENGTH, validationMessages.titleTooLong)
  .refine((value) => !/ {2,}/.test(value), validationMessages.titleSpaces);

export const loginSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, validationMessages.loginRequired)
    .max(50, validationMessages.nameLength),
  password: z
    .string()
    .min(1, validationMessages.passwordRequired)
    .max(MAX_PASSWORD_LENGTH, validationMessages.passwordLength),
});

export const registerSchema = z
  .object({
    name: nameField,
    email: emailField,
    password: passwordField,
    passwordConfirm: passwordConfirmField,
  })
  .refine((values) => values.password === values.passwordConfirm, {
    message: validationMessages.passwordMismatch,
    path: ['passwordConfirm'],
  });

export const todoFormSchema = z.object({
  title: taskTitleField,
});

export const userSettingsSchema = z.object({
  showCreatedAt: z.boolean(),
});

export type LoginValues = z.infer<typeof loginSchema>;
export type RegisterValues = z.infer<typeof registerSchema>;
export type TodoFormValues = z.infer<typeof todoFormSchema>;
export type UserSettingsValues = z.infer<typeof userSettingsSchema>;

export interface ValidationSuccess<TData> {
  ok: true;
  data: TData;
}

export interface ValidationFailure {
  ok: false;
  error: ValidationError;
  errors: FieldErrors;
}

export type ValidationResult<TData> = ValidationSuccess<TData> | ValidationFailure;

/** Converts Zod issues into a `field -> first message` map. */
export function collectFieldErrors(issues: readonly ZodIssue[]): FieldErrors {
  const errors: FieldErrors = {};

  for (const issue of issues) {
    const field = issue.path.length > 0 ? issue.path.map(String).join('.') : 'form';

    if (!(field in errors)) {
      errors[field] = issue.message;
    }
  }

  return errors;
}

export function isValidationField(value: string): value is ValidationField {
  return (validationFields as readonly string[]).includes(value);
}

export function firstFieldError(
  errors: FieldErrors,
  order?: readonly string[],
): [string, string] | null {
  if (order) {
    for (const field of order) {
      const message = errors[field];

      if (message !== undefined) {
        return [field, message];
      }
    }
  }

  const entry = Object.entries(errors)[0];

  return entry ?? null;
}

/** Runs a schema and returns either parsed data or a ready-to-display validation error. */
export function validateWithSchema<TData>(
  schema: ZodType<TData>,
  input: unknown,
): ValidationResult<TData> {
  const parsed = schema.safeParse(input);

  if (parsed.success) {
    return { ok: true, data: parsed.data };
  }

  const errors = collectFieldErrors(parsed.error.issues);
  const [field, message] = firstFieldError(errors) ?? ['form', validationMessages.invalid];

  return {
    ok: false,
    errors,
    error: {
      kind: 'validation',
      field: isValidationField(field) ? field : 'form',
      message,
      code: 'validation',
    },
  };
}

export type AsyncValidationRule = (value: string) => Promise<string | true>;

/**
 * Builds an async uniqueness rule for an email.
 * The checker returns true when the email is free.
 */
export function createEmailAvailabilityRule(
  check: (email: string) => Promise<boolean>,
  message: string = validationMessages.emailTaken,
): AsyncValidationRule {
  return async (value) => {
    const normalized = value.trim().toLowerCase();

    // Format errors are reported by the sync schema, so skip the request.
    if (!emailField.safeParse(normalized).success) {
      return true;
    }

    const available = await check(normalized);

    return available ? true : message;
  };
}

/**
 * Keeps async rule results between keystrokes.
 * Without it every revalidation would repeat the same uniqueness request.
 */
export function cacheAsyncRule(rule: AsyncValidationRule, capacity = 50): AsyncValidationRule {
  const cache = new Map<string, string | true>();

  return async (value) => {
    const key = value.trim().toLowerCase();
    const cached = cache.get(key);

    if (cached !== undefined) {
      return cached;
    }

    const result = await rule(value);

    if (cache.size >= capacity) {
      const oldestKey = cache.keys().next().value;

      if (oldestKey !== undefined) {
        cache.delete(oldestKey);
      }
    }

    cache.set(key, result);
    return result;
  };
}
