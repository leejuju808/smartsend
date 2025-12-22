import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs'

export async function GET(_: Request, { params }: { params: { id: string } }) {
  const supabase = createRouteHandlerClient({ cookies })
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const { data, error } = await supabase
    .from('invite_tokens')
    .select('id, token, role, expires_at')
    .eq('campaign_id', params.id)
    .eq('is_link', true)
    .eq('consumed', false)
    .gt('expires_at', new Date().toISOString())
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  if (!data) return NextResponse.json({ link: null })
  
  const appOrigin = process.env.APP_ORIGIN || process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
  return NextResponse.json({
    link: `${appOrigin}/accept-invite?token=${data.token}`,
    role: data.role,
    expiresAt: data.expires_at,
    inviteId: data.id
  })
}

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const supabase = createRouteHandlerClient({ cookies })
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const body = await req.json().catch(()=>({})) as { role?: 'viewer'|'editor', ttlHours?: number }
  const role = body.role ?? 'viewer'
  const ttlHours = Math.min(Math.max(body.ttlHours ?? 72, 1), 720) // clamp 1h–30d

  const token = crypto.randomUUID().replace(/-/g,'')
  const expires = new Date(Date.now() + ttlHours*3600*1000).toISOString()

  const { data: inv, error: invErr } = await supabase
    .from('invite_tokens')
    .insert({
      campaign_id: params.id,
      email: null,
      role,
      token,
      is_link: true,
      created_by: user.id,
      expires_at: expires
    })
    .select('id').single()
  if (invErr) return NextResponse.json({ error: invErr.message }, { status: 400 })

  await supabase.rpc('log_activity', {
    p_campaign: params.id,
    p_actor: user.id,
    p_event: 'link_created',
    p_meta: { invite_id: inv.id, role, ttl_hours: ttlHours }
  })

  const appOrigin = process.env.APP_ORIGIN || process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
  return NextResponse.json({ 
    link: `${appOrigin}/accept-invite?token=${token}`, 
    role, 
    expiresAt: expires, 
    inviteId: inv.id 
  })
}

export async function DELETE(req: Request, { params }: { params: { id: string } }) {
  const supabase = createRouteHandlerClient({ cookies })
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const { inviteId } = await req.json() as { inviteId: string }

  // mark consumed to revoke
  const { data: inv, error } = await supabase
    .from('invite_tokens')
    .update({ consumed: true, accepted_at: new Date().toISOString(), accepted_by: user.id })
    .eq('id', inviteId)
    .eq('is_link', true)
    .select('campaign_id').single()
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })

  await supabase.rpc('log_activity', {
    p_campaign: inv.campaign_id,
    p_actor: user.id,
    p_event: 'link_revoked',
    p_meta: { invite_id: inviteId }
  })

  return NextResponse.json({ ok: true })
}

