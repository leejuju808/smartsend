// /app/api/campaigns/[id]/collaborators/route.ts
import { NextResponse } from 'next/server'
import { serverClient } from '@/lib/supabaseServer'

export async function GET(_: Request, { params }: { params: { id: string } }) {
  const sb = serverClient()
  const { data: { user } } = await sb.auth.getUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const { data, error } = await sb
    .from('campaign_collaborators')
    .select('user_id, permission')
    .eq('campaign_id', params.id)
  
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data || [])
}

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const sb = serverClient()
  const { data: { user } } = await sb.auth.getUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const body = await req.json()
  const { error } = await sb.from('campaign_collaborators').upsert({
    campaign_id: params.id,
    user_id: body.user_id,
    permission: body.permission
  })
  
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}

