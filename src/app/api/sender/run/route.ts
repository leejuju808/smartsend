import 'server-only'
import { createAdminClient } from '@/lib/supabase'
import { unsubscribeLink } from '@/server/unsub'
// planLimitsMiddleware and incrementSendCount replaced by atomic counters
import nodemailer from 'nodemailer'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const CAPS = { free: 50, pro: 500 } as const

// Simple sender loop: sends up to N queued respecting 8/min per inbox and quiet hours 22:00-06:00 in user tz (fallback UTC)
export async function POST() {
  const sb = createAdminClient()
  // Fetch candidates
  const { data: queued } = await sb
    .from('email_sends')
    .select('id, user_id, to_email, subject, body, created_at')
    .eq('status', 'queued')
    .order('created_at', { ascending: true })
    .limit(25)

  const results: any[] = []
  for (const job of queued || []) {
    // Plan + quiet hours (from profile tz/quiet_*; fallback to old timezone column if needed)
    const { data: prof } = await sb
      .from('profiles')
      .select('subscription_status, tz, quiet_start, quiet_end, timezone, email')
      .eq('id', job.user_id)
      .maybeSingle()
    const plan = (prof as any)?.subscription_status === 'pro' ? 'pro' : 'free'
    const limit = CAPS[plan as keyof typeof CAPS]
    const tz = (prof as any)?.tz || (prof as any)?.timezone || 'UTC'
    const qStart = (prof as any)?.quiet_start ?? 21
    const qEnd = (prof as any)?.quiet_end ?? 6
    const ownerEmail = (prof as any)?.email as string | undefined
    const hour = Number(new Intl.DateTimeFormat('en-US', { hour: 'numeric', hour12: false, timeZone: tz }).format(new Date()))
    const quietActive = qStart <= qEnd ? (hour >= qStart && hour < qEnd) : (hour >= qStart || hour < qEnd)
    if (quietActive) {
      results.push({ id: job.id, status: 'skipped_quiet_hours' })
      continue
    }

    // Reserve 1 send atomically; if at cap, mark failed
    const { data: reserved, error: reserveErr } = await sb.rpc('reserve_daily_sends', { p_user: job.user_id, p_n: 1, p_limit: limit })
    const ok = Array.isArray(reserved) ? (reserved as any)[0]?.ok : (reserved as any)?.ok
    if (reserveErr || !ok) {
      await sb.from('email_sends').update({ status: 'failed', failure_reason: 'limit_exceeded' }).eq('id', job.id)
      results.push({ id: job.id, status: 'failed', reason: 'limit' })
      continue
    }
    // Unsubscribe check (per owner)
    const { data: unsub } = await sb
      .from('leads')
      .select('id')
      .eq('email', job.to_email)
      .eq('owner_email', ownerEmail || '')
      .eq('unsubscribed', true)
      .maybeSingle()
    if (unsub) {
      await sb.from('email_sends').update({ status: 'failed', failure_reason: 'unsubscribed' }).eq('id', job.id)
      console.error('send_failed_unsubscribed', { id: job.id, to: job.to_email })
      await sb.rpc('release_daily_sends', { p_user: job.user_id, p_n: 1 })
      results.push({ id: job.id, status: 'failed', reason: 'unsubscribed' })
      continue
    }
    // Per-inbox 8/min throttle: naive using recent sent timestamps
    const since = new Date(Date.now() - 60 * 1000).toISOString()
    const { count } = await sb
      .from('email_sends')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', job.user_id)
      .eq('status', 'sent')
      .gte('sent_at', since)
    if ((count || 0) >= 8) {
      await sb.rpc('release_daily_sends', { p_user: job.user_id, p_n: 1 })
      results.push({ id: job.id, status: 'throttled' })
      continue
    }

    try {
      // Enforce %UNSUB% token presence and inject unsubscribe link
      if (!/%UNSUB%/.test(job.body)) {
        await sb.from('email_sends').update({ status: 'failed', failure_reason: 'missing_unsub' }).eq('id', job.id)
        await sb.rpc('release_daily_sends', { p_user: job.user_id, p_n: 1 })
        results.push({ id: job.id, status: 'failed', reason: 'missing_unsub' })
        continue
      }

      // Ensure we have a lead id for tokenized link
      let leadId: string | null = null
      if (ownerEmail) {
        const { data: leadRow } = await sb
          .from('leads')
          .select('id')
          .eq('owner_email', ownerEmail)
          .eq('email', job.to_email)
          .maybeSingle()
        if (leadRow?.id) {
          leadId = leadRow.id as string
        } else {
          const { data: upserted } = await sb
            .from('leads')
            .upsert({ owner_email: ownerEmail, email: job.to_email }, { onConflict: 'owner_email,email' })
            .select('id')
            .maybeSingle()
          leadId = (upserted as any)?.id || null
        }
      }

      const finalBody = leadId && ownerEmail
        ? job.body.replace(/%UNSUB%/g, `Unsubscribe: ${unsubscribeLink(leadId, ownerEmail)}`)
        : job.body.replace(/%UNSUB%/g, 'Unsubscribe by replying "unsubscribe"')
      // Load SMTP creds
      const { data: mb } = await sb
        .from('mailboxes')
        .select('provider, smtp_host, smtp_port, smtp_username, smtp_password, from_name, from_email')
        .eq('user_id', job.user_id)
        .maybeSingle()
      if (!mb || mb.provider !== 'smtp') throw new Error('mailbox_not_ready')
      const transporter = nodemailer.createTransport({
        host: mb.smtp_host!,
        port: Number(mb.smtp_port) || 587,
        secure: false,
        auth: mb.smtp_username && mb.smtp_password ? { user: mb.smtp_username, pass: mb.smtp_password } : undefined,
      })
      const info = await transporter.sendMail({
        from: `${mb.from_name || 'SmartSend'} <${mb.from_email || mb.smtp_username}>`,
        to: job.to_email,
        subject: job.subject,
        text: finalBody,
      })
      // Only increment on accepted
      const accepted = Array.isArray((info as any)?.accepted) ? (info as any).accepted.length > 0 : true
      if (accepted) {
        await sb.from('email_sends').update({ status: 'sent', sent_at: new Date().toISOString() }).eq('id', job.id)
        results.push({ id: job.id, status: 'sent' })
      } else {
        await sb.from('email_sends').update({ status: 'failed', failure_reason: 'rejected' }).eq('id', job.id)
        await sb.rpc('release_daily_sends', { p_user: job.user_id, p_n: 1 })
        console.error('send_failed_rejected', { id: job.id })
        results.push({ id: job.id, status: 'failed', reason: 'rejected' })
      }
    } catch (e: any) {
      try { await sb.rpc('release_daily_sends', { p_user: job.user_id, p_n: 1 }) } catch {}
      await sb.from('email_sends').update({ status: 'failed', failure_reason: e?.message || 'error' }).eq('id', job.id)
      console.error('send_failed_error', { id: job.id, error: e?.message || String(e) })
      results.push({ id: job.id, status: 'failed', reason: e?.message || 'error' })
    }
  }

  return new Response(JSON.stringify({ ok: true, results }), { status: 200, headers: { 'content-type': 'application/json' } })
}

