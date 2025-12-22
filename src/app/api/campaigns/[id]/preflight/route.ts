// app/api/campaigns/[id]/preflight/route.ts
import { NextResponse } from 'next/server'
import { evaluatePreflight } from '@/lib/preflight'
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs'
import { cookies } from 'next/headers'

export async function GET(_: Request, { params }:{ params:{ id: string }}) {
  // ensure requester owns the campaign
  const supabase = createRouteHandlerClient({ cookies })
  const { data: c } = await supabase.from('campaigns').select('id,user_id').eq('id', params.id).single()
  if (!c) return NextResponse.json({ error:'not_found' }, { status: 404 })
  const { data: me } = await supabase.auth.getUser()
  if (!me?.user || me.user.id !== c.user_id) return NextResponse.json({ error:'forbidden' }, { status: 403 })

  const res = await evaluatePreflight(params.id)
  return NextResponse.json(res)
}

