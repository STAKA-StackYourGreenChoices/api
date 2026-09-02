/**
 * Sentry initialisation. Imported first in main.ts so instrumentation is in
 * place before any application module is loaded.
 *
 * Sentry is an optional dependency: when SENTRY_DSN is unset (local dev, CI,
 * tests) this is a no-op, so nothing here can break a run that has no DSN.
 */
if (process.env.SENTRY_DSN && process.env.APP_ENV !== 'preview') {
  try {
    /* eslint-disable @typescript-eslint/no-require-imports, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call */
    const Sentry = require('@sentry/nestjs');
    Sentry.init({
      dsn: process.env.SENTRY_DSN,
      environment: process.env.APP_ENV ?? 'development',
      release: process.env.GIT_SHA,
      tracesSampleRate: process.env.APP_ENV === 'production' ? 0.1 : 1.0,
    });
    /* eslint-enable */
  } catch {
    console.warn('SENTRY_DSN is set but @sentry/nestjs is not installed.');
  }
}
