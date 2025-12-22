import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabaseAdmin'

export const runtime = 'nodejs'

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url)
    const profile_id = searchParams.get('profile_id')
    if (!profile_id) return NextResponse.json({ error: 'Missing profile_id' }, { status: 400 })
    const { data, error } = await supabaseAdmin.from('profiles').select('calendly_url, timezone').eq('id', profile_id).maybeSingle()
    if (error) throw error
    return NextResponse.json(data ?? {})
  } catch (e:any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

export async function POST(req: Request) {
  try {
    const { profile_id, calendly_url, timezone } = await req.json()
    if (!profile_id) return NextResponse.json({ error: 'Missing profile_id' }, { status: 400 })
    const { error } = await supabaseAdmin.from('profiles').update({
      calendly_url: calendly_url ?? null,
      timezone: timezone ?? 'America/Los_Angeles'
    }).eq('id', profile_id)
    if (error) throw error
    return NextResponse.json({ ok: true })
  } catch (e:any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
