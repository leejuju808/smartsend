import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs'

export async function PATCH(req: Request, { params }: { params: { id: string, shareId: string } }) {
  const supabase = createRouteHandlerClient({ cookies })
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const body = await req.json() as { role: 'viewer'|'editor' }
  const { data, error } = await supabase
    .from('campaign_shares')
    .update({ role: body.role })
    .eq('id', params.shareId)
    .select('id,user_id,role')
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })

  // Log activity
  await supabase.rpc('log_activity', {
    p_campaign: params.id,
    p_actor: user.id,
    p_event: 'share_updated',
    p_meta: { share_id: params.shareId, role: body.role, target_user_id: data.user_id }
  })

  return NextResponse.json({ share: data })
}

export async function DELETE(_: Request, { params }: { params: { id: string, shareId: string } }) {
  const supabase = createRouteHandlerClient({ cookies })
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const { error } = await supabase
    .from('campaign_shares')
    .delete()
    .eq('id', params.shareId)

  if (error) return NextResponse.json({ error: error.message }, { status: 400 })

  // Log activity
  await supabase.rpc('log_activity', {
    p_campaign: params.id,
    p_actor: user.id,
    p_event: 'share_removed',
    p_meta: { share_id: params.shareId }
  })

  return NextResponse.json({ ok: true })
}

