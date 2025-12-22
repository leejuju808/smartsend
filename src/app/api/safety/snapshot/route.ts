import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabaseAdmin'

export const runtime = 'nodejs'

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url)
    const profile_id = searchParams.get('profile_id')
    if (!profile_id) return NextResponse.json({ error: 'Missing profile_id' }, { status: 400 })

    // Get one sender (latest)
    const { data: sender, error: sErr } = await supabaseAdmin
      .from('senders')
      .select('*')
      .eq('profile_id', profile_id)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    if (sErr) throw sErr
    if (!sender) return NextResponse.json({ error: 'No sender found' }, { status: 404 })

    const [{ data: warmed }, { count: hourCount }, { data: todayStats }, { data: last200 }] = await Promise.all([
      supabaseAdmin.rpc('get_warmed_daily_cap', { p_sender_id: sender.id }),
      supabaseAdmin.from('messages').select('id', { count: 'exact', head: true }).eq('sender_id', sender.id).gte('created_at', new Date(Date.now() - 60*60*1000).toISOString()),
      supabaseAdmin.from('sender_stats').select('sent_count').eq('sender_id', sender.id).eq('stat_date', new Date().toISOString().slice(0,10)).maybeSingle(),
      supabaseAdmin.from('messages').select('status').eq('sender_id', sender.id).order('created_at', { ascending: false }).limit(200)
    ])

    const hourly_limit = sender.hourly_limit
    const warmed_daily_cap = warmed ?? sender.target_daily_limit
    const hour_used = hourCount || 0
    const day_used = todayStats?.sent_count ?? 0

    const statuses = (last200 ?? []).map(r => r.status as string)
    const bounced = statuses.filter(s => s === 'bounced').length
    const delivered = statuses.filter(s => s === 'sent' || s === 'queued' || s === 'failed').length
    const denom = Math.max(1, bounced + delivered)
    const bounce_rate = bounced / denom

    return NextResponse.json({
      sender: {
        id: sender.id,
        from_email: sender.from_email,
        status: sender.status,
        hourly_limit: sender.hourly_limit,
        base_daily_limit: sender.base_daily_limit,
        target_daily_limit: sender.target_daily_limit,
        warmup_increment: sender.warmup_increment,
        created_at: sender.created_at
      },
      snapshot: {
        hourly_limit,
        warmed_daily_cap,
        hour_used,
        day_used,
        bounce_rate
      }
    })
  } catch (e: any) {
    console.error(e)
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
