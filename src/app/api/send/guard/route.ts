import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabaseAdmin'

export const runtime = 'nodejs'

type Recipient = { email: string }
type GuardRequest = {
  profile_id: string
  sender_id: string
  recipients: Recipient[]
}

async function assertActive(profile_id: string) {
  const { data, error } = await supabaseAdmin
    .from('profiles')
    .select('subscription_status')
    .eq('id', profile_id)
    .maybeSingle()
  if (error) throw error
  const ok = data?.subscription_status === 'active' || data?.subscription_status === 'trialing'
  if (!ok) throw new Error('Subscription required to send.')
}

async function getHourCount(sender_id: string): Promise<number> {
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString()
  const { count, error } = await supabaseAdmin
    .from('messages')
    .select('id', { count: 'exact', head: true })
    .eq('sender_id', sender_id)
    .gte('created_at', oneHourAgo)
  if (error) throw error
  return count || 0
}

async function getTodayCount(sender_id: string): Promise<number> {
  const today = new Date().toISOString().slice(0, 10)
  const { data, error } = await supabaseAdmin
    .from('sender_stats')
    .select('sent_count')
    .eq('sender_id', sender_id)
    .eq('stat_date', today)
    .maybeSingle()
  if (error) throw error
  return data?.sent_count ?? 0
}

async function getWarmedDailyCap(sender_id: string): Promise<number> {
  const { data, error } = await supabaseAdmin.rpc('get_warmed_daily_cap', { p_sender_id: sender_id })
  if (error) throw error
  return data ?? 20
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as GuardRequest
    const { profile_id, sender_id, recipients } = body

    if (!profile_id || !sender_id || !recipients?.length) {
      return NextResponse.json({ error: 'Missing profile_id, sender_id, or recipients' }, { status: 400 })
    }

    await assertActive(profile_id)

    const { data: sender, error: senderErr } = await supabaseAdmin
      .from('senders')
      .select('status, hourly_limit')
      .eq('id', sender_id)
      .eq('profile_id', profile_id)
      .maybeSingle()
    if (senderErr) throw senderErr
    if (!sender) return NextResponse.json({ error: 'Sender not found' }, { status: 404 })
    if (sender.status === 'paused') {
      return NextResponse.json({ allowed: [], blocked: recipients, reason: 'sender_paused' }, { status: 200 })
    }

    const [hourCount, todayCount, warmedCap] = await Promise.all([
      getHourCount(sender_id),
      getTodayCount(sender_id),
      getWarmedDailyCap(sender_id),
    ])

    const hourRemaining = Math.max(0, sender.hourly_limit - hourCount)
    const dayRemaining = Math.max(0, warmedCap - todayCount)
    let remaining = Math.min(hourRemaining, dayRemaining)

    const emails = Array.from(new Set(recipients.map(r => r.email?.trim().toLowerCase()).filter(Boolean)))

    const [{ data: suppressed }, { data: bounced }] = await Promise.all([
      supabaseAdmin.from('suppressions').select('email').eq('profile_id', profile_id).in('email', emails),
      supabaseAdmin.from('bounces').select('email').eq('profile_id', profile_id).in('email', emails),
    ])

    const supSet = new Set((suppressed || []).map(x => x.email.toLowerCase()))
    const bounceSet = new Set((bounced || []).map(x => x.email.toLowerCase()))

    const blocked: Recipient[] = []
    const allowed: Recipient[] = []

    for (const r of recipients) {
      const e = r.email?.toLowerCase()
      if (!e) continue
      if (supSet.has(e) || bounceSet.has(e) || remaining <= 0) {
        blocked.push({ email: e })
        continue
      }
      allowed.push({ email: e })
      remaining -= 1
    }

    return NextResponse.json({
      allowed,
      blocked,
      limits: {
        hourly_limit: sender.hourly_limit,
        warmed_daily_cap: warmedCap,
        hour_used: hourCount,
        day_used: todayCount,
      }
    })
  } catch (e: any) {
    const msg = /Subscription required/.test(e.message)
      ? 'Subscription required. Visit /billing to subscribe.'
      : e.message
    const code = /Subscription required/.test(msg) ? 402 : 500
    return NextResponse.json({ error: msg }, { status: code })
  }
}
