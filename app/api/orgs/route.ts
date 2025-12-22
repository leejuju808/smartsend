import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs'

export async function POST(req: Request) {
  const supabase = createRouteHandlerClient({ cookies })
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error:'unauthorized' }, { status:401 })
  const { name } = await req.json()

  const { data: org, error } = await supabase
    .from('organizations').insert({ name, created_by: user.id })
    .select('id').single()
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })

  await supabase.from('org_members').insert({ org_id: org.id, user_id: user.id, role: 'admin' })

  // set current org
  await supabase.from('profiles').update({ current_org_id: org.id }).eq('user_id', user.id)

  return NextResponse.json({ id: org.id })
}

