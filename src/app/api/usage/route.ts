import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/server/supabase'

const CAPS = { free: 50, pro: 500 } as const

export async function GET(req: Request) {
  const url = new URL(req.url)
  const userId = url.searchParams.get('userId') || ''

  if (!userId) return NextResponse.json({ error: 'no user' }, { status: 401 })

  const { data: prof, error: pErr } = await supabaseAdmin
    .from('profiles')
    .select('id, subscription_status')
    .eq('id', userId)
    .maybeSingle()
  if (pErr || !prof) return NextResponse.json({ error: 'profile' }, { status: 400 })

  const plan = prof.subscription_status === 'pro' ? 'pro' : (prof.subscription_status ?? 'free')
  const cap = CAPS[plan as keyof typeof CAPS] ?? CAPS.free

  const today = new Date().toISOString().slice(0, 10)
  const { data: cnt, error: cErr } = await supabaseAdmin
    .from('daily_send_counters')
    .select('count')
    .eq('user_id', userId)
    .eq('day', today)
    .maybeSingle()

  let usedToday = cnt?.count ?? 0

  if (cErr) {
    const start = `${today}T00:00:00.000Z`
    const end = `${today}T23:59:59.999Z`
    const { count } = await supabaseAdmin
      .from('email_sends')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId)
      .gte('created_at', start)
      .lte('created_at', end)
    usedToday = count ?? 0
  }

  return NextResponse.json({
    plan,
    limit: cap,
    usedToday,
    remaining: Math.max(0, cap - usedToday),
    warning: usedToday >= Math.floor(cap * 0.8),
    atCap: usedToday >= cap,
  })
}

