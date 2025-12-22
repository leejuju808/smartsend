import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { sendMail } from '@/lib/mailer'

export const runtime = 'nodejs'

/**
 * Vercel Cron (or manual CURL) hits this endpoint to deliver queued emails.
 * Security: requires header `x-cron-secret: ${CRON_SECRET}`
 */
const BATCH_SIZE = Number(process.env.SEND_BATCH_SIZE || 50)
const MAX_ATTEMPTS = Number(process.env.SEND_MAX_ATTEMPTS || 5)

async function isPaid(profile_id: string): Promise<boolean> {
  const { data } = await supabaseAdmin
    .from('profiles')
    .select('subscription_status')
    .eq('id', profile_id)
    .maybeSingle()
  const s = data?.subscription_status
  return s === 'active' || s === 'trialing'
}

async function fetchBatch() {
  // Lock a batch: pick queued & not locked recently
  // We'll soft-lock by setting locked_at=now() to avoid double processing.
  const { data: batch, error } = await supabaseAdmin
    .from('messages')
    .select('id, profile_id, sender_id, to_email, subject, body, attempts, status, provider_message_id')
    .eq('status', 'queued')
    .is('locked_at', null)
    .order('created_at', { ascending: true })
    .limit(BATCH_SIZE)
  if (error) throw error
  if (!batch?.length) return []

  const ids = batch.map(b => b.id)
  const { error: lockErr } = await supabaseAdmin
    .from('messages')
    .update({ locked_at: new Date().toISOString() })
    .in('id', ids)
  if (lockErr) throw lockErr
  return batch
}

async function getSender(sender_id: string, profile_id: string) {
  const { data, error } = await supabaseAdmin
    .from('senders')
    .select('from_email, status')
    .eq('id', sender_id)
    .eq('profile_id', profile_id)
    .maybeSingle()
  if (error) throw error
  return data
}

async function log(profile_id: string, message_id: string, sender_id: string | null, to_email: string, event: string, detail?: string) {
  await supabaseAdmin.from('delivery_logs').insert({
    profile_id, message_id, sender_id, to_email, event, detail: detail ?? null
  })
}

export async function GET(req: Request) {
  try {
    const secret = req.headers.get('x-cron-secret')
    if (!process.env.CRON_SECRET || secret !== process.env.CRON_SECRET) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const batch = await fetchBatch()
    if (batch.length === 0) return NextResponse.json({ processed: 0 })

    let sent = 0, failed = 0, skipped = 0

    for (const m of batch) {
      const { id, profile_id, sender_id, to_email } = m

      // Ensure paid
      const paid = await isPaid(profile_id)
      if (!paid) {
        await supabaseAdmin.from('messages')
          .update({ status: 'queued', locked_at: null, last_error: 'Not paid' })
          .eq('id', id)
        await log(profile_id, id, sender_id, to_email, 'skipped', 'Not paid')
        skipped++
        continue
      }

      // Ensure sender is usable
      const sender = sender_id ? await getSender(sender_id, profile_id) : null
      if (!sender || sender.status === 'paused') {
        await supabaseAdmin.from('messages')
          .update({ status: 'failed', last_error: 'Sender missing or paused', locked_at: null })
          .eq('id', id)
        await log(profile_id, id, sender_id ?? null, to_email, 'failed', 'Sender missing/paused')
        failed++
        continue
      }

      // Prepare content
      const from = sender.from_email
      const subject = m.subject || 'Quick question'
      const html = m.body || 'Hi — quick question for you.'
      const text = (m.body || 'Hi — quick question for you.').replace(/<[^>]*>/g, '')

      try {
        // Set some helper headers for threading / future reply capture
        const headers: Record<string, string> = {
          'X-SS-Profile': profile_id,
          'X-SS-Message': id
        }

        const result = await sendMail({
          from, to: to_email.toLowerCase(), subject, html, text, headers
        })

        await supabaseAdmin.from('messages').update({
          status: 'sent',
          sent_at: new Date().toISOString(),
          provider_message_id: result.messageId || null,
          attempts: m.attempts + 1,
          last_error: null,
          locked_at: null
        }).eq('id', id)

        await log(profile_id, id, sender_id ?? null, to_email, 'sent', result.messageId || undefined)
        sent++
      } catch (err: any) {
        const attempts = (m.attempts ?? 0) + 1
        const willRetry = attempts < MAX_ATTEMPTS
        await supabaseAdmin.from('messages').update({
          status: willRetry ? 'queued' : 'failed',
          attempts,
          last_error: err.message?.slice(0, 500) || 'send error',
          locked_at: null
        }).eq('id', id)
        await log(profile_id, id, sender_id ?? null, to_email, willRetry ? 'attempt' : 'failed', err.message)
        if (willRetry) skipped++; else failed++
      }
    }

    return NextResponse.json({ processed: batch.length, sent, failed, skipped })
  } catch (e: any) {
    console.error(e)
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
