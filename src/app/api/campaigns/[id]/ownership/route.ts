import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs'

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const supabase = createRouteHandlerClient({ cookies })
  const { targetOrgId } = await req.json() as { targetOrgId: string | null }

  const payload: any = targetOrgId
    ? { org_id: targetOrgId, owner_org_id: targetOrgId, owned_by: 'org' }
    : { owned_by: 'user', org_id: null, owner_org_id: null }

  const { error } = await supabase.from('campaigns').update(payload).eq('id', params.id)
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json({ ok: true })
}

