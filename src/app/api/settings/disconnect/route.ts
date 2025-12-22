import { NextRequest, NextResponse } from 'next/server'
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs'
import { cookies } from 'next/headers'

export async function POST(req: NextRequest) {
  const url = new URL(req.url)
  const provider = url.searchParams.get('provider')

  if (!provider) {
    return NextResponse.json({ error: { message: 'Provider parameter required' } }, { status: 400 })
  }

  const sb = createRouteHandlerClient({ cookies })
  const { data: { user } } = await sb.auth.getUser()

  if (!user) return NextResponse.json({ error: { message: 'Auth required' } }, { status: 401 })

  const { error } = await sb
    .from('provider_accounts')
    .delete()
    .eq('user_id', user.id)
    .eq('provider', provider)

  if (error) return NextResponse.json({ error }, { status: 400 })

  return NextResponse.json({ ok: true })
}











