import { NextResponse } from 'next/server'
import { serverClient } from '@/lib/supabaseServer'

export async function POST(req: Request) {
  const sb = serverClient()
  const { data: { user } } = await sb.auth.getUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const { name } = await req.json()
  const { error, data } = await sb.from('organizations').insert({ name, owner_id: user.id }).select('*').single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json(data)
}
