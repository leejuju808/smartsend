import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { nextBusinessMoment } from '@/lib/cadence/time'
import { mergeTemplate } from '@/lib/cadence/merge'

function b64url(raw: string) {
  return Buffer.from(raw).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

async function sendGmail(
  accessToken: string,
  fromEmail: string,
  to: string,
  subject: string,
  body: string
) {
  const raw = [
    `From: ${fromEmail}`,
    `To: ${to}`,
    `Subject: ${subject}`,
    `Content-Type: text/plain; charset="UTF-8"`,
    '',
    body,
  ].join('\r\n')
  const r = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ raw: b64url(raw) }),
  })
  if (!r.ok) throw new Error(await r.text())
  return r.json()
}

export async function POST(_: NextRequest) {
  const supabase = createServiceClient()

  // 1) Lock due items (simple soft-lock)
  const now = new Date().toISOString()
  const { data: due, error: lockError } = await supabase.rpc('lock_due_cadence_queue_items', {
    p_now: now,
    p_limit: 20,
  })

  if (lockError) {
    console.error('Failed to lock queue items:', lockError)
    return NextResponse.json({ error: 'Failed to lock queue items' }, { status: 500 })
  }

  const results: any[] = []
  for (const q of due ?? []) {
    try {
      // Fetch sequence and enrollment data first
      const { data: seq } = await supabase
        .from('cadence_sequences')
        .select('*')
        .eq('id', q.sequence_id)
        .single()

      if (!seq || !seq.owner_user_id) throw new Error('sequence owner not found')

      const { data: enroll } = await supabase
        .from('cadence_enrollments')
        .select('*')
        .eq('id', q.enrollment_id)
        .single()

      if (!enroll || enroll.status !== 'active' || enroll.replied) {
        results.push({ id: q.id, ok: true, skipped: 'inactive or replied' })
        continue
      }

      // Resolve account to send from (simplest: first connected Gmail)
      const { data: acct } = await supabase
        .from('connected_accounts')
        .select('access_token,email')
        .eq('user_id', seq.owner_user_id)
        .eq('provider', 'gmail')
        .limit(1)
        .maybeSingle()

      if (!acct) throw new Error('no gmail account connected')

      await sendGmail(acct.access_token, acct.email, q.to_email, q.subject || '', q.body)

      // mark sent
      await supabase
        .from('cadence_send_queue')
        .update({ sent_at: new Date().toISOString(), locked_at: null })
        .eq('id', q.id)

      await supabase
        .from('cadence_enrollments')
        .update({ last_sent_at: new Date().toISOString() })
        .eq('id', q.enrollment_id)

      const { data: nextStep } = await supabase
        .from('cadence_steps')
        .select('*')
        .eq('sequence_id', enroll.sequence_id)
        .eq('step_index', q.step_index + 1)
        .maybeSingle()

      if (!nextStep) {
        await supabase.from('cadence_enrollments').update({ status: 'completed' }).eq('id', enroll.id)
        results.push({ id: q.id, ok: true, status: 'sequence completed' })
        continue
      }

      const at = nextBusinessMoment(
        new Date(),
        nextStep.wait_days,
        seq.timezone,
        { start: seq.daily_start, end: seq.daily_end },
        seq.quiet_weekends
      )
      const bodyMerged = mergeTemplate(nextStep.body, {
        first_name: enroll.lead_first_name,
        company: enroll.lead_company,
      })

      await supabase.from('cadence_send_queue').insert({
        enrollment_id: enroll.id,
        sequence_id: enroll.sequence_id,
        step_index: q.step_index + 1,
        to_email: enroll.lead_email,
        subject: nextStep.subject ?? '',
        body: bodyMerged,
        scheduled_at: at.toISOString(),
      })

      await supabase
        .from('cadence_enrollments')
        .update({ current_step: q.step_index + 1 })
        .eq('id', enroll.id)

      results.push({ id: q.id, ok: true })
    } catch (e: any) {
      console.error('Error processing queue item:', e)
      await supabase
        .from('cadence_send_queue')
        .update({
          attempts: (q.attempts ?? 0) + 1,
          error: String(e),
          locked_at: null,
        })
        .eq('id', q.id)
      results.push({ id: q.id, ok: false, error: String(e) })
    }
  }
  return NextResponse.json({ ok: true, results })
}

