import { NextRequest, NextResponse } from 'next/server'
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs'
import { cookies } from 'next/headers'

export async function POST(req: NextRequest) {
  const { provider } = await req.json()
  const sb = createRouteHandlerClient({ cookies })
  const { data: { user } } = await sb.auth.getUser()

  if (!user) return NextResponse.json({ error: { message: 'Auth required' } }, { status: 401 })

  const { error } = await sb.from('user_mail_settings').upsert(
    { 
      user_id: user.id, 
      default_provider: provider ?? null, 
      updated_at: new Date().toISOString() 
    },
    { onConflict: 'user_id' }
  )

  if (error) return NextResponse.json({ error }, { status: 400 })

  return NextResponse.json({ ok: true })
}











