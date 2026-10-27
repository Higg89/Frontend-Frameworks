import type { ZodType } from 'zod';
import {
  customRules,
  emailField,
  passwordField,
  taskTitleField,
  validationMessages,
  type FieldErrors,
  type CustomRule,
} from '@/utils/validation';

/**
 * Small helpers shared by forms and Quasar inputs.
 * Rules are derived from the schemas in `validation.ts`,
 * so the same constraints are never written twice.
 */

export interface FieldRule {
  (value: unknown): true | string;
}

/** Turns a Zod schema into a Quasar rule. */
export function ruleFromSchema(
  schema: ZodType,
  fallbackMessage: string = validationMessages.invalid,
): FieldRule {
  return (value) => {
    const parsed = schema.safeParse(typeof value === 'string' ? value : '');

    if (parsed.success) {
      return true;
    }

    return parsed.error.issues[0]?.message ?? fallbackMessage;
  };
}

export const emailRule = ruleFromSchema(emailField);
export const passwordRule = ruleFromSchema(passwordField);
export const taskTitleRule = ruleFromSchema(taskTitleField);

/** Wraps a custom rule so it can be passed to a Quasar input. */
export function customRule<TValue>(rule: CustomRule<TValue>): FieldRule {
  return (value) => rule(value as TValue) ?? true;
}

/** Runs rules in order and returns the first error. */
export function combineRules(...rules: readonly FieldRule[]): FieldRule {
  return (value) => {
    for (const rule of rules) {
      const result = rule(value);

      if (result !== true) {
        return result;
      }
    }

    return true;
  };
}

/** Compares two values, for example a password and its confirmation. */
export function sameValueRule(readValue: () => unknown, message: string): FieldRule {
  return (value) => (value === readValue() ? true : message);
}

export function fieldError(errors: FieldErrors, field: string): string {
  return errors[field] ?? '';
}

export function hasFieldErrors(errors: FieldErrors): boolean {
  return Object.keys(errors).length > 0;
}

export function mergeErrors(...sources: readonly FieldErrors[]): FieldErrors {
  return Object.assign({}, ...sources) as FieldErrors;
}

export interface DebouncedTask<TArgs extends unknown[]> {
  (...args: TArgs): void;
  cancel: () => void;
}

/** Delays a call, keeping only the last arguments. */
export function debounce<TArgs extends unknown[]>(
  task: (...args: TArgs) => void,
  waitMs: number,
): DebouncedTask<TArgs> {
  let timer: ReturnType<typeof setTimeout> | null = null;

  const debounced = (...args: TArgs): void => {
    if (timer !== null) {
      clearTimeout(timer);
    }

    timer = setTimeout(() => {
      timer = null;
      task(...args);
    }, waitMs);
  };

  debounced.cancel = (): void => {
    if (timer !== null) {
      clearTimeout(timer);
      timer = null;
    }
  };

  return debounced;
}

export { customRules };
