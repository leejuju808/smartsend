import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs'

export async function GET(_: Request, { params }: { params: { id: string } }) {
  const supabase = createRouteHandlerClient({ cookies })
  const { data, error } = await supabase
    .from('campaign_rules')
    .select('*')
    .eq('campaign_id', params.id)
    .maybeSingle()
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json(data || {
    campaign_id: params.id,
    stop_on_reply: true,
    stop_on_unsubscribe: true,
    stop_on_ooh: true,
    stop_on_bounce: true,
    custom_positive_keywords: [],
    custom_negative_keywords: [],
    autoresponder_keywords: ['out of office', 'automatic reply', 'autoreply']
  })
}

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const supabase = createRouteHandlerClient({ cookies })
  const body = await req.json()
  const { data, error } = await supabase
    .from('campaigns')
    .update({
      stop_on_reply: body.stop_on_reply,
      stop_on_unsubscribe: body.stop_on_unsubscribe,
      stop_on_ooh: body.stop_on_ooh,
      stop_on_bounce: body.stop_on_bounce,
      custom_positive_keywords: body.custom_positive_keywords,
      custom_negative_keywords: body.custom_negative_keywords,
      autoresponder_keywords: body.autoresponder_keywords,
      updated_at: new Date().toISOString()
    })
    .eq('id', params.id)
    .select('id')
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json({ ok: true })
}

