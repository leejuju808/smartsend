import { NextResponse } from 'next/server'
import { randomUUID } from 'crypto'
import { serverClient } from '@/lib/supabaseServer'

export async function POST(req: Request, { params }: { params: { orgId: string } }) {
  const sb = serverClient()
  const { data: { user } } = await sb.auth.getUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const { email, role = 'member' } = await req.json()
  const token = randomUUID()

  // Check if user is member/admin/owner
  const { data: membership } = await sb
    .from('org_memberships')
    .select('role')
    .eq('org_id', params.orgId)
    .eq('user_id', user.id)
    .eq('status', 'active')
    .maybeSingle()

  if (!membership || !['owner', 'admin'].includes(membership.role)) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  }

  // Delete any existing pending invite for this email in this org
  await sb
    .from('org_memberships')
    .delete()
    .eq('org_id', params.orgId)
    .eq('invited_email', email.toLowerCase())
    .is('user_id', null)
    .eq('status', 'pending')

  // Insert a pending membership row (user_id null until accept)
  const { error: insErr } = await sb.from('org_memberships').insert({
    org_id: params.orgId,
    user_id: null,                // unknown yet
    invited_email: email.toLowerCase(),
    role,
    status: 'pending',
    invited_token: token
  })
  
  if (insErr) return NextResponse.json({ error: insErr.message }, { status: 500 })

  // Return invite URL (send via your email system later)
  const url = new URL(`/join?token=${token}`, process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000')
  return NextResponse.json({ invite_url: url.toString() })
}

