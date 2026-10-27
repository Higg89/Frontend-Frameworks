import type { AppError } from '@/types';
import { readEnvFlag, readEnvNumber, readEnvString } from '@/utils/env';
import { isCanceled, normalizeError } from '@/utils/errorHandling';

/**
 * Lightweight Sentry-compatible monitoring facade.
 *
 * The application ships without the Sentry SDK: events are collected in a
 * bounded in-memory queue and, when an endpoint is configured, sent with
 * fetch(). This keeps the production bundle small and makes the integration
 * testable. To use the real service, install @sentry/vue and forward the
 * events from `monitoring` to Sentry in this module only.
 *
 * No personal data or secrets are collected. A DSN is a public client key,
 * but it is still read from the environment instead of being hard-coded.
 */

export type MonitoringLevel = 'fatal' | 'error' | 'warning' | 'info' | 'debug';

export interface MonitoringBreadcrumb {
  timestamp: string;
  category: string;
  message: string;
  level: MonitoringLevel;
  data?: Record<string, unknown>;
}

export interface MonitoringEvent {
  eventId: string;
  timestamp: string;
  level: MonitoringLevel;
  message: string;
  environment: string;
  release: string;
  platform: 'javascript';
  tags: Record<string, string>;
  extra: Record<string, unknown>;
  breadcrumbs: MonitoringBreadcrumb[];
  user?: { id?: string; username?: string; email?: string };
  exception?: { type: string; value: string; stack?: string };
}

export type WebVitalName = 'CLS' | 'FCP' | 'FID' | 'INP' | 'LCP' | 'TTFB' | 'Navigation';

export interface MonitoringMetric {
  /** A Core Web Vital name (CLS, FCP, INP, LCP, TTFB) or a custom metric. */
  name: WebVitalName | (string & {});
  value: number;
  rating: 'good' | 'needs-improvement' | 'poor';
  delta: number;
  id: string;
}

export interface MonitoringOptions {
  enabled?: boolean;
  dsn?: string;
  environment?: string;
  release?: string;
  endpoint?: string;
  sampleRate?: number;
  maxEvents?: number;
}

export interface ErrorReportLike {
  error: AppError;
  context: string;
}

export interface MonitoringUser {
  id?: number | string;
  name?: string;
  email?: string;
}

export interface MonitoringClient {
  init: (options?: MonitoringOptions) => void;
  isEnabled: () => boolean;
  captureException: (cause: unknown, context?: string, extra?: Record<string, unknown>) => void;
  captureErrorReport: (report: ErrorReportLike) => void;
  captureMessage: (
    message: string,
    level?: MonitoringLevel,
    extra?: Record<string, unknown>,
  ) => void;
  captureMetric: (metric: MonitoringMetric) => void;
  addBreadcrumb: (
    category: string,
    message: string,
    data?: Record<string, unknown>,
    level?: MonitoringLevel,
  ) => void;
  setUser: (user: MonitoringUser | null) => void;
  trackNavigation: (to: string, from: string, durationMs: number) => void;
  getEvents: () => readonly MonitoringEvent[];
  clear: () => void;
  flush: () => Promise<void>;
}

interface ResolvedOptions {
  enabled: boolean;
  dsn: string;
  environment: string;
  release: string;
  endpoint: string;
  sampleRate: number;
  maxEvents: number;
}

const MAX_BREADCRUMBS = 30;

function readOptions(options: MonitoringOptions = {}): ResolvedOptions {
  const sampleRate = readEnvNumber(
    options.sampleRate ?? import.meta.env.VITE_SENTRY_TRACES_SAMPLE_RATE,
    0.1,
    0,
    1,
  );

  return {
    enabled: options.enabled ?? readEnvFlag(import.meta.env.VITE_SENTRY_ENABLED),
    dsn: options.dsn ?? readEnvString(import.meta.env.VITE_SENTRY_DSN),
    environment:
      options.environment ??
      readEnvString(
        import.meta.env.VITE_SENTRY_ENVIRONMENT,
        readEnvString(import.meta.env.VITE_APP_ENV, 'production'),
      ),
    release: options.release ?? readEnvString(import.meta.env.VITE_APP_VERSION, '0.0.0'),
    endpoint: options.endpoint ?? readEnvString(import.meta.env.VITE_MONITORING_ENDPOINT),
    sampleRate,
    maxEvents: Math.max(1, options.maxEvents ?? 100),
  };
}

function eventId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }

  return `evt-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function errorType(cause: unknown): string {
  if (cause instanceof Error && cause.name.length > 0) {
    return cause.name;
  }

  return 'Error';
}

function errorStack(cause: unknown): string | undefined {
  return cause instanceof Error ? cause.stack : undefined;
}

export function createMonitoringClient(options: MonitoringOptions = {}): MonitoringClient {
  let resolved = readOptions(options);
  let breadcrumbs: MonitoringBreadcrumb[] = [];
  let events: MonitoringEvent[] = [];
  let user: MonitoringUser | null = null;
  const pending = new Set<Promise<void>>();

  function addBreadcrumb(
    category: string,
    message: string,
    data?: Record<string, unknown>,
    level: MonitoringLevel = 'info',
  ): void {
    const breadcrumb: MonitoringBreadcrumb = {
      timestamp: new Date().toISOString(),
      category,
      message,
      level,
    };

    if (data !== undefined) {
      breadcrumb.data = data;
    }

    breadcrumbs.push(breadcrumb);

    if (breadcrumbs.length > MAX_BREADCRUMBS) {
      breadcrumbs = breadcrumbs.slice(-MAX_BREADCRUMBS);
    }
  }

  function send(event: MonitoringEvent): void {
    if (!resolved.enabled || resolved.endpoint === '' || typeof fetch !== 'function') {
      return;
    }

    const request = fetch(resolved.endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(event),
      keepalive: true,
    })
      .then(() => undefined)
      .catch(() => {
        // Monitoring must never break the application or create an error loop.
      });

    pending.add(request);
    void request.finally(() => pending.delete(request));
  }

  function pushEvent(event: Omit<MonitoringEvent, 'eventId' | 'timestamp' | 'breadcrumbs'>): void {
    const complete: MonitoringEvent = {
      eventId: eventId(),
      timestamp: new Date().toISOString(),
      ...event,
      breadcrumbs: [...breadcrumbs],
    };

    events.push(complete);

    if (events.length > resolved.maxEvents) {
      events = events.slice(-resolved.maxEvents);
    }

    send(complete);
  }

  function captureException(
    cause: unknown,
    context = 'app',
    extra: Record<string, unknown> = {},
  ): void {
    const error = normalizeError(cause);

    if (isCanceled(error)) {
      return;
    }

    const exception: MonitoringEvent['exception'] = {
      type: errorType(cause),
      value: error.message,
    };
    const stack = errorStack(cause);

    if (stack !== undefined) {
      exception.stack = stack;
    }

    pushEvent({
      level: error.kind === 'unexpected' ? 'fatal' : 'error',
      message: error.message,
      environment: resolved.environment,
      release: resolved.release,
      platform: 'javascript',
      tags: {
        context,
        kind: error.kind,
        code: error.code ?? error.kind,
        retryable: String(error.retryable === true),
      },
      extra,
      exception,
      ...(user === null
        ? {}
        : {
            user: {
              ...(user.id === undefined ? {} : { id: String(user.id) }),
              ...(user.name === undefined ? {} : { username: user.name }),
              ...(user.email === undefined ? {} : { email: user.email }),
            },
          }),
    });
  }

  return {
    init(nextOptions = {}): void {
      resolved = readOptions(nextOptions);
      addBreadcrumb('app', 'Monitoring initialized', {
        enabled: resolved.enabled,
        environment: resolved.environment,
      });
    },

    isEnabled(): boolean {
      return resolved.enabled;
    },

    captureException,

    captureErrorReport(report): void {
      if (isCanceled(report.error)) {
        return;
      }

      pushEvent({
        level: report.error.kind === 'unexpected' ? 'fatal' : 'error',
        message: report.error.message,
        environment: resolved.environment,
        release: resolved.release,
        platform: 'javascript',
        tags: {
          context: report.context,
          kind: report.error.kind,
          code: report.error.code ?? report.error.kind,
          retryable: String(report.error.retryable === true),
        },
        extra: {},
        exception: {
          type: report.error.kind,
          value: report.error.message,
        },
        ...(user === null
          ? {}
          : {
              user: {
                ...(user.id === undefined ? {} : { id: String(user.id) }),
                ...(user.name === undefined ? {} : { username: user.name }),
                ...(user.email === undefined ? {} : { email: user.email }),
              },
            }),
      });
    },

    captureMessage(message, level = 'info', extra = {}): void {
      pushEvent({
        level,
        message,
        environment: resolved.environment,
        release: resolved.release,
        platform: 'javascript',
        tags: {},
        extra,
      });
    },

    captureMetric(metric): void {
      pushEvent({
        level: 'info',
        message: `metric:${metric.name}`,
        environment: resolved.environment,
        release: resolved.release,
        platform: 'javascript',
        tags: {
          metric: metric.name,
          rating: metric.rating,
        },
        extra: {
          value: metric.value,
          delta: metric.delta,
          metricId: metric.id,
        },
      });
    },

    addBreadcrumb,

    setUser(nextUser): void {
      user = nextUser;
      addBreadcrumb('auth', nextUser === null ? 'User signed out' : 'User signed in', {
        ...(nextUser?.id === undefined ? {} : { id: String(nextUser.id) }),
      });
    },

    trackNavigation(to, from, durationMs): void {
      addBreadcrumb('navigation', `${from} -> ${to}`, { durationMs });
      this.captureMetric({
        name: 'Navigation',
        value: durationMs,
        rating: durationMs <= 1000 ? 'good' : durationMs <= 3000 ? 'needs-improvement' : 'poor',
        delta: durationMs,
        id: `navigation-${Date.now().toString(36)}`,
      });
    },

    getEvents(): readonly MonitoringEvent[] {
      return [...events];
    },

    clear(): void {
      events = [];
      breadcrumbs = [];
      user = null;
    },

    async flush(): Promise<void> {
      await Promise.allSettled([...pending]);
    },
  };
}

export const monitoring = createMonitoringClient();

/** Initializes the default client and records the application start. */
export function initMonitoring(options: MonitoringOptions = {}): MonitoringClient {
  monitoring.init(options);
  monitoring.addBreadcrumb('app', 'Application started', {
    mode: import.meta.env.MODE,
    version: import.meta.env.VITE_APP_VERSION,
  });
  return monitoring;
}

export function subscribeMonitoringToErrors(
  subscribe: (sink: (report: ErrorReportLike) => void) => () => void,
): () => void {
  return subscribe((report) => monitoring.captureErrorReport(report));
}

function metricRating(name: string, value: number): MonitoringMetric['rating'] {
  const thresholds: Record<string, [number, number]> = {
    CLS: [0.1, 0.25],
    FCP: [1800, 3000],
    FID: [100, 300],
    INP: [200, 500],
    LCP: [2500, 4000],
    TTFB: [800, 1800],
  };
  const [good, poor] = thresholds[name] ?? [1000, 3000];

  if (value <= good) {
    return 'good';
  }

  return value <= poor ? 'needs-improvement' : 'poor';
}

interface LayoutShiftEntry extends PerformanceEntry {
  value: number;
  hadRecentInput: boolean;
}

/**
 * Reports Core Web Vitals without the web-vitals dependency.
 * Returns a cleanup function; safe to call in non-browser environments.
 */
export function reportWebVitals(onMetric: (metric: MonitoringMetric) => void): () => void {
  if (typeof window === 'undefined' || typeof PerformanceObserver === 'undefined') {
    return () => {};
  }

  const observers: PerformanceObserver[] = [];
  let cls = 0;
  let inp = 0;

  function report(name: WebVitalName, value: number, id: string): void {
    onMetric({
      name,
      value,
      rating: metricRating(name, value),
      delta: value,
      id,
    });
  }

  function observe(type: string, callback: (entries: PerformanceEntry[]) => void): void {
    try {
      const observer = new PerformanceObserver((list) => callback(list.getEntries()));
      observer.observe({ type, buffered: true });
      observers.push(observer);
    } catch {
      // Some browsers do not support every entry type; skip it.
    }
  }

  observe('largest-contentful-paint', (entries) => {
    const entry = entries.at(-1);

    if (entry) {
      report('LCP', entry.startTime, 'lcp');
    }
  });

  observe('paint', (entries) => {
    const fcp = entries.find((entry) => entry.name === 'first-contentful-paint');

    if (fcp) {
      report('FCP', fcp.startTime, 'fcp');
    }
  });

  observe('layout-shift', (entries) => {
    for (const entry of entries as LayoutShiftEntry[]) {
      if (!entry.hadRecentInput) {
        cls += entry.value;
      }
    }

    report('CLS', cls, 'cls');
  });

  observe('first-input', (entries) => {
    const entry = entries[0] as PerformanceEventTiming | undefined;

    if (entry) {
      report('FID', entry.processingStart - entry.startTime, 'fid');
    }
  });

  observe('event', (entries) => {
    for (const entry of entries as PerformanceEventTiming[]) {
      if (entry.interactionId !== undefined && entry.duration > inp) {
        inp = entry.duration;
      }
    }

    if (inp > 0) {
      report('INP', inp, 'inp');
    }
  });

  observe('navigation', (entries) => {
    const entry = entries[0] as PerformanceNavigationTiming | undefined;

    if (entry) {
      report('TTFB', entry.responseStart - entry.requestStart, 'ttfb');
    }
  });

  const disconnect = (): void => {
    for (const observer of observers) {
      observer.disconnect();
    }
  };

  const onHidden = (): void => {
    if (document.visibilityState === 'hidden') {
      disconnect();
    }
  };

  document.addEventListener('visibilitychange', onHidden, { once: true });
  window.addEventListener('pagehide', disconnect, { once: true });

  return () => {
    disconnect();
    document.removeEventListener('visibilitychange', onHidden);
    window.removeEventListener('pagehide', disconnect);
  };
}
