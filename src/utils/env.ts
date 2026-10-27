/**
 * Quasar replaces `import.meta.env.*` with literals at build time. Values such
 * as `true` and `0.1` become real booleans/numbers, while `vite` keeps them as
 * strings, so environment helpers accept both forms.
 */
export function readEnvFlag(
  value: string | boolean | number | undefined,
  fallback = false,
): boolean {
  if (typeof value === 'boolean') {
    return value;
  }

  if (typeof value === 'number') {
    return value !== 0;
  }

  if (typeof value === 'string') {
    return ['1', 'true', 'yes', 'on'].includes(value.trim().toLowerCase());
  }

  return fallback;
}

export function readEnvNumber(
  value: string | number | undefined,
  fallback: number,
  min = Number.NEGATIVE_INFINITY,
  max = Number.POSITIVE_INFINITY,
): number {
  const parsed = typeof value === 'number' ? value : Number.parseFloat(value ?? '');

  if (!Number.isFinite(parsed)) {
    return fallback;
  }

  return Math.min(max, Math.max(min, parsed));
}

export function readEnvString(value: string | undefined, fallback = ''): string {
  return value === undefined || value === '' ? fallback : value;
}
