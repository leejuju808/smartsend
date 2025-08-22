import 'server-only'
import { createAdminClient } from '@/lib/supabase'
import { sendEmail } from '@/lib/notify/mailer'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(req: Request) {
  const auth = req.headers.get('authorization') || ''
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : ''
  if (!process.env.CRON_SECRET || token !== process.env.CRON_SECRET) {
    return new Response('Unauthorized', { status: 401 })
  }
  const sb = createAdminClient()

  // Candidates: users in past_due or unpaid
  const { data: users } = await sb
    .from('users')
    .select('id,email,subscription_status')
    .in('subscription_status', ['past_due','unpaid'])
    .limit(5000)
  if (!users || users.length === 0) return new Response('OK', { status: 200 })

  const now = Date.now()
  const STAGES = (process.env.DUNNING_STAGES_DAYS || '0,3,7').split(',').map((s) => Math.max(0, Number(s.trim()) || 0))
  let sent = 0
  for (const u of users as any[]) {
    const { data: row } = await sb.from('dunning_state').select('stage,last_sent_at').eq('user_id', u.id).maybeSingle()
    const stageIdx = row?.stage ? Math.min(STAGES.length - 1, Math.max(0, Number(String(row.stage).replace('t','')))) : 0
    const last = row?.last_sent_at ? new Date(row.last_sent_at as string).getTime() : 0
    const daysForNext = STAGES[Math.min(stageIdx + 1, STAGES.length - 1)]
    const dueNext = last + daysForNext * 24 * 60 * 60 * 1000
    if (now < dueNext) continue

    const appUrl = (process.env.NEXT_PUBLIC_APP_URL as string).replace(/\/$/, '')
    const subject = stageIdx === 0
      ? 'We couldn’t renew your subscription'
      : stageIdx === 1
      ? 'Reminder: please update your card to keep your account active'
      : 'Final reminder: your account will pause soon'
    const text = `Hi,\n\nWe’re having trouble processing your renewal. Please update your payment method here:\n${appUrl}/dashboard/billing\n\nThanks!`
    if (u.email) {
      await sendEmail({ to: u.email as string, subject, text })
      await sb.from('dunning_state').upsert({
        user_id: u.id,
        stage: `t${Math.min(stageIdx + 1, STAGES.length - 1)}`,
        last_sent_at: new Date().toISOString(),
      })
      sent++
    }
  }
  return new Response(JSON.stringify({ ok: true, sent }), { status: 200, headers: { 'content-type': 'application/json' } })
}

