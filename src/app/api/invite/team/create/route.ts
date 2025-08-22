import 'server-only'
import { cookies } from 'next/headers'
import { NextRequest, NextResponse } from 'next/server'
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs'
import { createAdminClient } from '@/lib/supabase'
import { randomBytes } from 'crypto'
import { sendEmail } from '@/lib/notify/mailer'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function makeToken() {
  return randomBytes(16).toString('hex')
}

export async function POST(req: NextRequest) {
  const supabase = createRouteHandlerClient({ cookies })
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { teamId, email, role } = await req.json().catch(() => ({})) as { teamId?: string; email?: string; role?: 'owner'|'admin'|'member' }
  if (!teamId || !email) return NextResponse.json({ error: 'Missing teamId or email' }, { status: 400 })

  const admin = createAdminClient()

  // Verify caller is owner/admin of the team
  const { data: membership } = await admin
    .from('team_members')
    .select('role')
    .eq('team_id', teamId)
    .eq('user_id', user.id)
    .maybeSingle()

  const callerRole = (membership as any)?.role as string | undefined
  if (!callerRole || !['owner','admin'].includes(callerRole)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const token = makeToken()
  const expiresAt = new Date(Date.now() + 1000 * 60 * 60 * 24 * 7).toISOString()

  const { error } = await admin
    .from('team_invitations')
    .insert({ team_id: teamId, email, role: role || 'member', token, inviter_id: user.id, expires_at: expiresAt })
  if (error) return NextResponse.json({ error: String(error) }, { status: 500 })

  const base = process.env.NEXT_PUBLIC_APP_URL || new URL(req.url).origin
  const link = `${base}/accept-invite/${encodeURIComponent(token)}`

  // Send email (best-effort)
  try {
    await sendEmail({ to: email, subject: 'You\'re invited to a team on SmartSend', text: `Join the team: ${link}` })
  } catch {}

  return NextResponse.json({ ok: true, link })
}

