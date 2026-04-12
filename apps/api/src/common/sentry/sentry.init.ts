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

/**
 * Run a function inside a Sentry scope tagged with the current user/transport.
 * Any exception captured by Sentry within this scope (or thrown out of it) will
 * carry user_id + tags so alert rules can route to the right channel.
 *
 * Safe no-op if Sentry is not initialized.
 */
export async function withSentryUser<T>(
  ctx: { telegramId?: string; userId?: string; command?: string; transport?: string },
  fn: () => Promise<T>,
): Promise<T> {
  return Sentry.withScope(async (scope) => {
    if (ctx.telegramId || ctx.userId) {
      scope.setUser({
        id: ctx.userId ?? ctx.telegramId,
        username: ctx.telegramId ? `tg:${ctx.telegramId}` : undefined,
      });
    }
    if (ctx.transport) scope.setTag('transport', ctx.transport);
    if (ctx.command) scope.setTag('command', ctx.command);
    try {
      return await fn();
    } catch (err) {
      Sentry.captureException(err);
      throw err;
    }
  });
}
