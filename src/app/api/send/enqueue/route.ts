import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabaseAdmin'

export const runtime = 'nodejs'

type EnqueueItem = {
  to_email: string
  subject?: string
  body?: string
}

type EnqueueRequest = {
  profile_id: string
  sender_id: string
  messages: EnqueueItem[]
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

async function upsertTodayStats(sender_id: string, delta: number) {
  const today = new Date().toISOString().slice(0, 10)
  const { data, error } = await supabaseAdmin
    .from('sender_stats')
    .select('id, sent_count')
    .eq('sender_id', sender_id)
    .eq('stat_date', today)
    .maybeSingle()
  if (error) throw error

  if (!data) {
    const { error: insErr } = await supabaseAdmin.from('sender_stats').insert({
      sender_id,
      stat_date: today,
      sent_count: delta,
      last_sent_at: new Date().toISOString(),
    })
    if (insErr) throw insErr
  } else {
    const { error: updErr } = await supabaseAdmin.from('sender_stats').update({
      sent_count: (data.sent_count ?? 0) + delta,
      last_sent_at: new Date().toISOString(),
    }).eq('id', data.id)
    if (updErr) throw updErr
  }
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as EnqueueRequest
    const { profile_id, sender_id, messages } = body

    if (!profile_id || !sender_id || !messages?.length) {
      return NextResponse.json({ error: 'Missing profile_id, sender_id, or messages' }, { status: 400 })
    }

    await assertActive(profile_id)

    const rows = messages.map(m => ({
      profile_id,
      sender_id,
      to_email: m.to_email.toLowerCase(),
      subject: m.subject ?? null,
      body: m.body ?? null,
      status: 'queued' as const,
    }))

    const { error } = await supabaseAdmin.from('messages').insert(rows)
    if (error) throw error

    await upsertTodayStats(sender_id, rows.length)
    return NextResponse.json({ queued: rows.length })
  } catch (e: any) {
    const msg = /Subscription required/.test(e.message)
      ? 'Subscription required. Visit /billing to subscribe.'
      : e.message
    const code = /Subscription required/.test(msg) ? 402 : 500
    return NextResponse.json({ error: msg }, { status: code })
  }
}
