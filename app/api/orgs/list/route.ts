import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs'

export async function GET() {
  const supabase = createRouteHandlerClient({ cookies })
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error:'unauthorized' }, { status:401 })

  const { data, error } = await supabase
    .from('org_members')
    .select('org_id, role, organizations(name)')
    .eq('user_id', user.id)
  if (error) return NextResponse.json({ error: error.message }, { status:400 })

  // also fetch current org
  const { data: prof } = await supabase.from('profiles').select('current_org_id').eq('user_id', user.id).single()
  return NextResponse.json({ orgs: data, currentOrgId: prof?.current_org_id ?? null })
}

