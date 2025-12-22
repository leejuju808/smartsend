import { NextResponse } from 'next/server'
import { serverClient } from '@/lib/supabaseServer'

export async function GET(_: Request, { params }: { params: { orgId: string } }) {
  const sb = serverClient()
  const { data: { user } } = await sb.auth.getUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const { data, error } = await sb
    .from('org_memberships')
    .select('user_id, invited_email, role, status')
    .eq('org_id', params.orgId)
  
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data || [])
}
