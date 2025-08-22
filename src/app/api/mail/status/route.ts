import { NextResponse } from 'next/server'
import { createServerComponentClient, createAdminClient } from '@/lib/supabase'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const supa = createServerComponentClient()
    const { data: { user } } = await supa.auth.getUser()
    if (!user) return NextResponse.json({ ready: false })
    const admin = createAdminClient()
    const { data } = await admin
      .from('mailboxes')
      .select('provider, smtp_host, smtp_username, smtp_password, gmail_refresh_token')
      .eq('user_id', user.id)
      .maybeSingle()
    const ready = !!data && ((data.provider === 'smtp' && !!data.smtp_host && !!data.smtp_username && !!data.smtp_password) || (data.provider === 'gmail' && !!data.gmail_refresh_token))
    return NextResponse.json({ ready })
  } catch (e: any) {
    return NextResponse.json({ ready: false })
  }
}

import 'server-only'
import { createServerComponentClient } from '@/lib/supabase'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET() {
  const supa = createServerComponentClient()
  const { data: { user } } = await supa.auth.getUser()
  if (!user) return new Response(JSON.stringify({ ok: false, ready: false, anonymous: true }), { status: 200, headers: { 'content-type': 'application/json' } })

  const { data } = await supa
    .from('mailboxes')
    .select('provider, smtp_host, smtp_port, smtp_username, smtp_password, from_email')
    .eq('user_id', user.id)
    .maybeSingle()

  let ready = false
  let provider: 'gmail' | 'smtp' | 'none' = 'none'
  if (data) {
    provider = (data.provider as any) || 'none'
    if (provider === 'gmail') {
      ready = true
    } else if (provider === 'smtp') {
      const hostOk = Boolean((data as any).smtp_host)
      const portOk = Boolean((data as any).smtp_port)
      // Allow username/password to be absent if server accepts open relay (rare) but typically require both
      const authOk = Boolean((data as any).smtp_username && (data as any).smtp_password)
      ready = hostOk && portOk && authOk
    }
  }

  return new Response(JSON.stringify({ ok: true, ready, provider }), { status: 200, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } })
}

