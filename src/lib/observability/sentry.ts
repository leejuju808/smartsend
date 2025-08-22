import 'server-only'

let inited = false
export function initSentry() {
  if (inited) return
  const dsn = process.env.SENTRY_DSN
  if (!dsn) return
  try {
    // Lazy require so builds don’t fail locally
    const Sentry = require('@sentry/node')
    Sentry.init({
      dsn,
      environment: process.env.SENTRY_ENVIRONMENT || process.env.NODE_ENV || 'development',
      tracesSampleRate: Number(process.env.SENTRY_TRACES_SAMPLE_RATE ?? 0.05),
    })
    inited = true
  } catch {
    // ignore if not installed
  }
}

export function captureException(err: any, context?: Record<string, any>) {
  try {
    initSentry()
    const Sentry = require('@sentry/node')
    if (context) Sentry.setContext('ctx', context)
    Sentry.captureException(err)
  } catch {
    // no-op
  }
}

