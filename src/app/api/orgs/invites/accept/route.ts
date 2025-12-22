import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs'

export async function POST(req: Request) {
  const supabase = createRouteHandlerClient({ cookies })
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const { token } = await req.json() as { token: string }
  const { data, error } = await supabase.rpc('consume_org_invite', { p_token: token, p_user: user.id })
  if (error || !data?.[0]) return new NextResponse('invalid or expired', { status: 400 })

  const { org_id, role } = data[0] as { org_id: string, role: string }
  // Make it current org on first join
  await supabase.from('profiles').update({ current_org_id: org_id }).eq('user_id', user.id)
  return NextResponse.json({ orgId: org_id, role })
}
