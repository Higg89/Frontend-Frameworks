import { describe, expect, it, vi } from 'vitest';
import type { ZodIssue } from 'zod';
import {
  cacheAsyncRule,
  collectFieldErrors,
  createEmailAvailabilityRule,
  customRules,
  emailField,
  firstFieldError,
  isValidationField,
  loginSchema,
  nameField,
  passwordConfirmField,
  passwordField,
  registerSchema,
  runRules,
  taskTitleField,
  todoFormSchema,
  userSettingsSchema,
  validateWithSchema,
  validationMessages,
} from '@/utils/validation';

describe('validation schemas', () => {
  describe('nameField', () => {
    it('accepts names with letters, digits, spaces and hyphens', () => {
      expect(nameField.safeParse('Алексей').success).toBe(true);
      expect(nameField.safeParse('Иван-Петров 2').success).toBe(true);

      const trimmed = nameField.safeParse('  Мария  ');

      expect(trimmed.success).toBe(true);

      if (trimmed.success) {
        expect(trimmed.data).toBe('Мария');
      }
    });

    it('rejects an empty name', () => {
      const result = nameField.safeParse('   ');

      expect(result.success).toBe(false);

      if (!result.success) {
        expect(result.error.issues[0]?.message).toBe(validationMessages.nameRequired);
      }
    });

    it.each(['А', 'а'.repeat(51)])('rejects a name with invalid length: %s', (value) => {
      const result = nameField.safeParse(value);

      expect(result.success).toBe(false);

      if (!result.success) {
        expect(result.error.issues[0]?.message).toBe(validationMessages.nameLength);
      }
    });

    it.each(['@name', '<script>', ' name!', '_name'])(
      'rejects forbidden characters: %s',
      (value) => {
        const result = nameField.safeParse(value);

        expect(result.success).toBe(false);

        if (!result.success) {
          expect(result.error.issues[0]?.message).toBe(validationMessages.nameFormat);
        }
      },
    );
  });

  describe('emailField', () => {
    it('trims and accepts a valid email', () => {
      const result = emailField.safeParse('  user@example.com ');

      expect(result.success).toBe(true);

      if (result.success) {
        expect(result.data).toBe('user@example.com');
      }
    });

    it('rejects an empty email', () => {
      const result = emailField.safeParse('');

      expect(result.success).toBe(false);

      if (!result.success) {
        expect(result.error.issues[0]?.message).toBe(validationMessages.emailRequired);
      }
    });

    it('rejects an email without a domain', () => {
      const result = emailField.safeParse('not-an-email');

      expect(result.success).toBe(false);

      if (!result.success) {
        expect(result.error.issues[0]?.message).toBe(validationMessages.emailInvalid);
      }
    });

    it('rejects an email longer than 254 characters', () => {
      const result = emailField.safeParse(`${'a'.repeat(250)}@example.com`);

      expect(result.success).toBe(false);

      if (!result.success) {
        expect(result.error.issues[0]?.message).toBe(validationMessages.emailTooLong);
      }
    });
  });

  describe('password fields', () => {
    it('accepts a password from 4 to 72 characters', () => {
      expect(passwordField.safeParse('1234').success).toBe(true);
      expect(passwordField.safeParse('a'.repeat(72)).success).toBe(true);
    });

    it.each(['123', 'a'.repeat(73)])('rejects a password with an invalid length: %s', (value) => {
      const result = passwordField.safeParse(value);

      expect(result.success).toBe(false);

      if (!result.success) {
        expect(result.error.issues[0]?.message).toBe(validationMessages.passwordLength);
      }
    });

    it('requires the password confirmation to be filled', () => {
      const result = passwordConfirmField.safeParse('');

      expect(result.success).toBe(false);

      if (!result.success) {
        expect(result.error.issues[0]?.message).toBe(validationMessages.passwordConfirmRequired);
      }
    });
  });

  describe('taskTitleField', () => {
    it('trims and accepts a normal title', () => {
      const result = taskTitleField.safeParse('  Купить хлеб  ');

      expect(result.success).toBe(true);

      if (result.success) {
        expect(result.data).toBe('Купить хлеб');
      }
    });

    it.each(['', '   '])('rejects an empty title: "%s"', (value) => {
      const result = taskTitleField.safeParse(value);

      expect(result.success).toBe(false);

      if (!result.success) {
        expect(result.error.issues[0]?.message).toBe(validationMessages.titleRequired);
      }
    });

    it('rejects a title longer than 200 characters', () => {
      const result = taskTitleField.safeParse('a'.repeat(201));

      expect(result.success).toBe(false);

      if (!result.success) {
        expect(result.error.issues[0]?.message).toBe(validationMessages.titleTooLong);
      }
    });

    it('rejects repeated spaces inside a title', () => {
      const result = taskTitleField.safeParse('Купить  хлеб');

      expect(result.success).toBe(false);

      if (!result.success) {
        expect(result.error.issues[0]?.message).toBe(validationMessages.titleSpaces);
      }
    });
  });

  describe('object schemas', () => {
    it('validates login credentials', () => {
      expect(loginSchema.safeParse({ name: 'Алексей', password: 'demo' }).success).toBe(true);

      const result = loginSchema.safeParse({ name: '', password: '' });

      expect(result.success).toBe(false);

      if (!result.success) {
        expect(collectFieldErrors(result.error.issues)).toEqual({
          name: validationMessages.loginRequired,
          password: validationMessages.passwordRequired,
        });
      }
    });

    it('requires matching passwords on registration', () => {
      const result = registerSchema.safeParse({
        name: 'Мария',
        email: 'maria@example.com',
        password: 'secret',
        passwordConfirm: 'another',
      });

      expect(result.success).toBe(false);

      if (!result.success) {
        expect(collectFieldErrors(result.error.issues)).toEqual({
          passwordConfirm: validationMessages.passwordMismatch,
        });
      }
    });

    it('validates the todo form and settings schemas', () => {
      expect(todoFormSchema.safeParse({ title: 'Новая задача' }).success).toBe(true);
      expect(todoFormSchema.safeParse({ title: ' ' }).success).toBe(false);
      expect(userSettingsSchema.safeParse({ showCreatedAt: false }).success).toBe(true);
      expect(userSettingsSchema.safeParse({ showCreatedAt: 'yes' }).success).toBe(false);
    });
  });
});

describe('custom validation rules', () => {
  it('notBlank rejects whitespace-only values', () => {
    const rule = customRules.notBlank('Заполните поле');

    expect(rule('')).toBe('Заполните поле');
    expect(rule('  ')).toBe('Заполните поле');
    expect(rule('значение')).toBeNull();
  });

  it('matches checks a regular expression', () => {
    const rule = customRules.matches(/^\d+$/, 'Только цифры');

    expect(rule('123')).toBeNull();
    expect(rule('12a')).toBe('Только цифры');
  });

  it('maxWords limits the number of words', () => {
    const rule = customRules.maxWords(2, 'Слишком много слов');

    expect(rule('одно два')).toBeNull();
    expect(rule('  одно   два  ')).toBeNull();
    expect(rule('одно два три')).toBe('Слишком много слов');
  });

  it('oneOf accepts only allowed values', () => {
    const rule = customRules.oneOf(['all', 'active'], 'Неизвестный фильтр');

    expect(rule('active')).toBeNull();
    expect(rule('completed')).toBe('Неизвестный фильтр');
  });

  it('runRules returns the first error or null', () => {
    const rules = [customRules.notBlank('Пусто'), customRules.matches(/^\d+$/, 'Цифры')];

    expect(runRules('', rules)).toBe('Пусто');
    expect(runRules('abc', rules)).toBe('Цифры');
    expect(runRules('123', rules)).toBeNull();
  });
});

describe('validation helpers', () => {
  it('collectFieldErrors keeps the first message per field and names empty paths form', () => {
    const issues = [
      { code: 'custom', path: ['title'], message: 'Первая' },
      { code: 'custom', path: ['title'], message: 'Вторая' },
      { code: 'custom', path: ['profile', 'email'], message: 'Email' },
      { code: 'custom', path: [], message: 'Форма' },
    ] as unknown as ZodIssue[];

    expect(collectFieldErrors(issues)).toEqual({
      title: 'Первая',
      'profile.email': 'Email',
      form: 'Форма',
    });
  });

  it('firstFieldError respects the requested order', () => {
    const errors = { title: 'Название', email: 'Email' };

    expect(firstFieldError(errors, ['email', 'title'])).toEqual(['email', 'Email']);
    expect(firstFieldError(errors, ['name'])).toEqual(['title', 'Название']);
    expect(firstFieldError({})).toBeNull();
  });

  it('isValidationField recognises known fields only', () => {
    expect(isValidationField('title')).toBe(true);
    expect(isValidationField('email')).toBe(true);
    expect(isValidationField('unknown')).toBe(false);
  });

  it('validateWithSchema returns parsed data on success', () => {
    const result = validateWithSchema(loginSchema, { name: '  Мария ', password: 'demo' });

    expect(result.ok).toBe(true);

    if (result.ok) {
      expect(result.data.name).toBe('Мария');
    }
  });

  it('validateWithSchema returns a user-facing validation error on failure', () => {
    const result = validateWithSchema(todoFormSchema, { title: '' });

    expect(result.ok).toBe(false);

    if (!result.ok) {
      expect(result.errors).toEqual({ title: validationMessages.titleRequired });
      expect(result.error).toEqual({
        kind: 'validation',
        field: 'title',
        message: validationMessages.titleRequired,
        code: 'validation',
      });
    }
  });
});

describe('async validation helpers', () => {
  it('skips the availability request for an invalid email', async () => {
    const check = vi.fn(async () => false);
    const rule = createEmailAvailabilityRule(check);

    await expect(rule('not-an-email')).resolves.toBe(true);
    expect(check).not.toHaveBeenCalled();
  });

  it('normalizes the email before checking availability', async () => {
    const check = vi.fn(async () => true);
    const rule = createEmailAvailabilityRule(check);

    await expect(rule('  User@Example.COM ')).resolves.toBe(true);
    expect(check).toHaveBeenCalledWith('user@example.com');
  });

  it('returns a message when the email is already taken', async () => {
    const rule = createEmailAvailabilityRule(async () => false);

    await expect(rule('user@example.com')).resolves.toBe(validationMessages.emailTaken);
  });

  it('supports a custom taken message', async () => {
    const rule = createEmailAvailabilityRule(async () => false, 'Email занят');

    await expect(rule('user@example.com')).resolves.toBe('Email занят');
  });

  it('cacheAsyncRule caches normalized values and respects capacity', async () => {
    const rule = vi.fn(async (value: string) => (value === 'bad' ? 'Ошибка' : true));
    const cached = cacheAsyncRule(rule, 2);

    await expect(cached('A')).resolves.toBe(true);
    await expect(cached(' a ')).resolves.toBe(true);
    expect(rule).toHaveBeenCalledTimes(1);

    await cached('B');
    await cached('C');
    expect(rule).toHaveBeenCalledTimes(3);

    // A was the oldest entry and got evicted, so it is requested again.
    await cached('A');
    expect(rule).toHaveBeenCalledTimes(4);
    await expect(cached('bad')).resolves.toBe('Ошибка');
  });
});
