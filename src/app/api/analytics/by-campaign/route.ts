import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabaseAdmin'

export const runtime = 'nodejs'

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url)
    const profile_id = searchParams.get('profile_id')
    if (!profile_id) return NextResponse.json({ error: 'Missing profile_id' }, { status: 400 })

    const { data, error } = await supabaseAdmin
      .from('v_analytics_by_campaign')
      .select('campaign_id, sent, bounced, replies, positive_replies, meetings, mb_per_100')
      .eq('profile_id', profile_id)
      .order('mb_per_100', { ascending: false })

    if (error) throw error
    return NextResponse.json({ data })
  } catch (e: any) {
    console.error(e)
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
