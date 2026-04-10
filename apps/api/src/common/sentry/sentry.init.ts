import * as Sentry from '@sentry/node';

/**
 * Initialize Sentry error tracking.
 * Call this BEFORE NestFactory.create() in main.ts.
 */
export function initSentry(): void {
  const dsn = process.env.SENTRY_DSN;
  if (!dsn) return;

  Sentry.init({
    dsn,
    environment: process.env.NODE_ENV ?? 'development',
    tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 1.0,
    // Don't send PII
    sendDefaultPii: false,
  });
}
