import 'server-only'
import { createClient } from '@supabase/supabase-js'
import { getFreeDailyQuota } from '@/lib/usage'
import { sendEmail } from '@/lib/notify/mailer'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function admin() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } })
}

export async function POST(req: Request) {
  const auth = req.headers.get('authorization') || ''
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : ''
  if (!process.env.CRON_SECRET || token !== process.env.CRON_SECRET) {
    return new Response('Unauthorized', { status: 401 })
  }
  const threshold = Number(process.env.USAGE_ALERT_THRESHOLD ?? 1) // alert when remaining <= threshold
  const cooldownDays = Number(process.env.USAGE_ALERT_COOLDOWN_DAYS ?? 3)
  const cooldownMs = Math.max(1, cooldownDays) * 24 * 60 * 60 * 1000
  const sb = admin()

  // Aggregate today usage by user/kind (only those who used today)
  const start = new Date(); start.setHours(0,0,0,0)
  const { data: rows } = await sb
    .from('usage_events')
    .select('user_id, kind, qty, created_at')
    .gte('created_at', start.toISOString())
    .order('created_at', { ascending: true })
    .limit(50000)

  // Group sum
  const byUK = new Map<string, { user_id: string; kind: string; used: number }>()
  for (const r of rows || []) {
    const k = `${(r as any).user_id}|${(r as any).kind}`
    const cur = byUK.get(k) || { user_id: (r as any).user_id, kind: (r as any).kind, used: 0 }
    cur.used += Number((r as any).qty ?? 0)
    byUK.set(k, cur)
  }
  if (byUK.size === 0) return new Response('OK', { status: 200 })

  // Fetch profiles needed
  const userIds = Array.from(new Set(Array.from(byUK.values()).map(v => v.user_id)))
  const { data: profs } = await sb.from('profiles').select('id,email,subscription_status').in('id', userIds)
  const profMap = new Map((profs || []).map(p => [p.id, p as any]))

  let sent = 0
  for (const { user_id, kind, used } of byUK.values()) {
    const prof = profMap.get(user_id)
    if (!prof?.email) continue
    const status = (prof.subscription_status as string | undefined) || 'free'
    const isPro = status === 'pro' || status === 'active'
    if (isPro) continue
    const quota = getFreeDailyQuota(kind)
    const remaining = quota - used
    if (remaining > threshold) continue

    // Cooldown check
    const { data: alertRow } = await sb.from('usage_alerts').select('last_alert_at').eq('user_id', user_id).eq('kind', kind).maybeSingle()
    if (alertRow?.last_alert_at && Date.now() - new Date(alertRow.last_alert_at).getTime() < cooldownMs) continue

    const appUrl = String(process.env.NEXT_PUBLIC_APP_URL || '')
    await sendEmail({
      to: prof.email,
      subject: `You’re almost out of free ${kind} uses`,
      text: `Heads up — you used ${used}/${quota} today for ${kind}. Upgrade to keep going without limits:\n${appUrl ? appUrl.replace(/\/$/, '') + '/dashboard/billing' : ''}`,
    })
    await sb.from('usage_alerts').upsert({ user_id, kind, last_alert_at: new Date().toISOString() })
    sent++
  }
  return new Response(JSON.stringify({ ok: true, sent }), { status: 200, headers: { 'content-type': 'application/json' } })
}
