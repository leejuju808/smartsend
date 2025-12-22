import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs'

export async function POST(req: Request) {
  const supabase = createRouteHandlerClient({ cookies })
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error:'unauthorized' }, { status:401 })
  const { orgId } = await req.json()

  // ensure membership
  const { data: mem } = await supabase.from('org_members').select('id').eq('org_id', orgId).eq('user_id', user.id).maybeSingle()
  if (!mem) return NextResponse.json({ error:'not-a-member' }, { status:403 })

  await supabase.from('profiles').update({ current_org_id: orgId }).eq('user_id', user.id)
  return NextResponse.json({ ok:true })
}

