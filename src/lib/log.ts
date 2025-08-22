import pino from 'pino'
import { createAdminClient } from './supabase'

const logger = pino({ level: process.env.LOG_LEVEL || 'info' })

export function log(event: string, fields?: Record<string, unknown>) {
  try {
    logger.info({ event, ...(fields || {}) })
  } catch {
    // no-op
  }
}

export async function error(event: string, fields?: Record<string, unknown>) {
  try {
    logger.error({ event, ...(fields || {}) })
  } catch {
    // Fallback to audit_log table if available
    try {
      const sb = createAdminClient()
      await sb.from('analytics_events').insert({ name: 'logger_error', context: { event, ...(fields || {}) } })
    } catch {
      // last resort
      console.error(`[error] ${event}`)
    }
  }
}
