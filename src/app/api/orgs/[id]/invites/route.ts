import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs'

export async function GET(_: Request, { params }: { params: { id: string } }) {
  const supabase = createRouteHandlerClient({ cookies })
  const { data, error } = await supabase
    .from('org_invites')
    .select('id,email,role,created_at,expires_at,consumed')
    .eq('org_id', params.id)
    .eq('consumed', false)
    .gt('expires_at', new Date().toISOString())
    .order('created_at', { ascending: false })
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json({ invites: data })
}

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const supabase = createRouteHandlerClient({ cookies })
  const body = await req.json() as { email: string, role: 'admin'|'member'|'viewer', ttlHours?: number }
  const token = crypto.randomUUID().replace(/-/g,'')
  const ttl = Math.min(Math.max(body.ttlHours ?? 336, 1), 720) // default 14d
  const expires = new Date(Date.now() + ttl*3600*1000).toISOString()

  const { data: me } = await supabase.auth.getUser()
  if (!me?.user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const { error: invErr } = await supabase.from('org_invites').insert({
    org_id: params.id, 
    email: body.email, 
    role: body.role, 
    token, 
    created_by: me.user.id, 
    expires_at: expires
  })
  if (invErr) return NextResponse.json({ error: invErr.message }, { status: 400 })

  // Email via your notify-edge
  await fetch(process.env.NOTIFY_EMAIL_URL || '', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${process.env.CRON_SECRET || ''}` },
    body: JSON.stringify({
      kind: 'org-invite',
      email: body.email,
      role: body.role,
      acceptUrl: `${process.env.APP_ORIGIN || process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/accept-org?token=${token}`
    })
  }).catch(()=>{})

  return NextResponse.json({ invited: true })
}

export async function DELETE(req: Request, { params }: { params: { id: string } }) {
  const supabase = createRouteHandlerClient({ cookies })
  const { inviteId } = await req.json() as { inviteId: string }
  const { error } = await supabase.from('org_invites').delete().eq('id', inviteId)
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json({ ok: true })
}

