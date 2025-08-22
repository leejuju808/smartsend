import 'server-only'
import { cookies } from 'next/headers'
import { NextRequest, NextResponse } from 'next/server'
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs'
import { createAdminClient } from '@/lib/supabase'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  const supabase = createRouteHandlerClient({ cookies })
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { token } = await req.json().catch(() => ({})) as { token?: string }
  if (!token) return NextResponse.json({ error: 'Missing token' }, { status: 400 })

  const admin = createAdminClient()
  const { data: invite } = await admin
    .from('team_invitations')
    .select('id, team_id, role, email, expires_at, accepted_at, accepted_by')
    .eq('token', token)
    .maybeSingle()

  if (!invite) return NextResponse.json({ error: 'Invalid invite' }, { status: 404 })
  if ((invite as any).accepted_at) return NextResponse.json({ error: 'Already accepted' }, { status: 410 })
  const exp = (invite as any).expires_at ? new Date((invite as any).expires_at).getTime() : 0
  if (exp && exp < Date.now()) return NextResponse.json({ error: 'Invite expired' }, { status: 410 })

  // Upsert membership
  const teamId = (invite as any).team_id as string
  const role = (invite as any).role as string
  await admin
    .from('team_members')
    .upsert({ team_id: teamId, user_id: user.id, role }, { onConflict: 'team_id,user_id' })

  // Mark accepted
  await admin
    .from('team_invitations')
    .update({ accepted_by: user.id, accepted_at: new Date().toISOString() })
    .eq('id', (invite as any).id)

  return NextResponse.json({ ok: true, teamId })
}

