import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs'

export async function POST(req: Request, { params }: { params:{ id: string } }) {
  const supabase = createRouteHandlerClient({ cookies })
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error:'unauthorized' }, { status:401 })
  const body = await req.json() as { email: string, role: 'admin'|'member'|'viewer' }

  const { data: uid } = await supabase.rpc('user_id_by_email', { p_email: body.email })
  if (!uid) return NextResponse.json({ error:'user-not-found' }, { status:404 })

  const { error } = await supabase.from('org_members').upsert({
    org_id: params.id, user_id: uid as string, role: body.role
  }, { onConflict: 'org_id,user_id' })
  if (error) return NextResponse.json({ error: error.message }, { status:400 })

  return NextResponse.json({ ok: true })
}

