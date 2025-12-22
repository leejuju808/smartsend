import { NextResponse } from 'next/server'
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs'
import { cookies } from 'next/headers'

export async function GET(req: Request, { params }: { params: { id: string } }) {
  const url = new URL(req.url)
  const status = url.searchParams.get('status') // optional filter
  const supabase = createRouteHandlerClient({ cookies })

  let q = supabase.from('lead_threads')
    .select('id, campaign_id, subject, last_message_at, status, snooze_until, from_email, lead_id')
    .eq('campaign_id', params.id)
    .order('last_message_at', { ascending: false })
    .limit(100)

  if (status) q = q.eq('status', status)

  const { data, error } = await q
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json({ threads: data ?? [] })
}

