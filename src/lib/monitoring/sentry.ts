import 'server-only'
import * as Sentry from '@sentry/node'

let inited = false
function ensureInit() {
  if (inited) return
  const dsn = process.env.SENTRY_DSN
  if (!dsn) return
  Sentry.init({
    dsn,
    tracesSampleRate: 0.05,
    environment: process.env.SENTRY_ENVIRONMENT || process.env.VERCEL_ENV || process.env.NODE_ENV,
  })
  inited = true
}

export function captureError(err: unknown, extra?: Record<string, unknown>) {
  try {
    ensureInit()
    if (inited) {
      Sentry.captureException(err, { extra })
    } else {
      // Fallback to console if DSN is not set
      console.error(JSON.stringify({ level: 'error', event: 'captureError', error: String(err), extra }))
    }
  } catch {}
}

export function captureMessage(msg: string, extra?: Record<string, unknown>) {
  try {
    ensureInit()
    if (inited) {
      Sentry.captureMessage(msg, { extra })
    } else {
      console.log(JSON.stringify({ level: 'info', event: 'captureMessage', message: msg, extra }))
    }
  } catch {}
}

import 'server-only'
import * as Sentry from '@sentry/node'

let inited = false
function ensureInit() {
  if (inited) return
  const dsn = process.env.SENTRY_DSN
  if (!dsn) return
  Sentry.init({
    dsn,
    tracesSampleRate: 0.05,
    environment: process.env.SENTRY_ENVIRONMENT || process.env.VERCEL_ENV || process.env.NODE_ENV,
  })
  inited = true
}

export function captureError(err: unknown, extra?: Record<string, unknown>) {
  try {
    ensureInit()
    if (inited) {
      Sentry.captureException(err, { extra })
    } else {
      // Fallback to console if DSN is not set
      console.error(JSON.stringify({ level: 'error', event: 'captureError', error: String(err), extra }))
    }
  } catch {}
}

export function captureMessage(msg: string, extra?: Record<string, unknown>) {
  try {
    ensureInit()
    if (inited) {
      Sentry.captureMessage(msg, { extra })
    } else {
      console.log(JSON.stringify({ level: 'info', event: 'captureMessage', message: msg, extra }))
    }
  } catch {}
}
