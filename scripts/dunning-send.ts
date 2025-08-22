#!/usr/bin/env tsx
import { createClient } from '@supabase/supabase-js'
import { sendEmail } from '../src/lib/notify/mailer'
import pino from 'pino'

const logger = pino({ level: process.env.LOG_LEVEL || 'info' })

const url = process.env.NEXT_PUBLIC_SUPABASE_URL as string
const key = process.env.SUPABASE_SERVICE_ROLE_KEY as string
const supabase = createClient(url, key, { auth: { persistSession: false } })

async function main() {
  const thresholdIso = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString()
  const { data: profiles, error } = await supabase
    .from('profiles')
    .select('id, subscription_status, subscription_updated_at')
    .eq('subscription_status', 'past_due')
    .lte('subscription_updated_at', thresholdIso)
    .limit(1000)
  if (error) throw error

  for (const p of profiles || []) {
    const { data: userRow } = await supabase
      .from('users')
      .select('email')
      .eq('id', p.id)
      .maybeSingle()
    const email = userRow?.email as string | undefined
    if (!email) continue

    const tmpl = 'past_due_day3'
    const { data: sent } = await supabase
      .from('dunning_events')
      .select('id').eq('profile_id', p.id).eq('template', tmpl).maybeSingle()
    if (sent?.id) continue
    await sendEmail({
      to: email,
      subject: 'Action needed: update your SmartSend billing',
      text: `Hi,\n\nYour subscription payment failed. Please update your card to restore full access:\n\n${process.env.NEXT_PUBLIC_APP_URL || 'https://yourapp.com'}/dashboard/billing\n\nThanks!`,
    })
    await supabase.from('dunning_events').insert({ profile_id: p.id, template: tmpl })
    logger.info({ event: 'dunning_sent', profile_id: p.id })
  }
  logger.info({ event: 'dunning_done' })
}

main().catch(async (e) => {
  try {
    logger.error({ event: 'dunning_error', message: e?.message })
  } catch {
    // best-effort fallback
    console.error(e)
  }
  process.exit(1)
})
