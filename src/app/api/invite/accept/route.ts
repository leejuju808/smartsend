import 'server-only'
import { cookies } from 'next/headers'
import { NextRequest, NextResponse } from 'next/server'
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs'
import { createAdminClient } from '@/lib/supabase'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

async function resolveInviterIdByCode(code: string): Promise<string | null> {
  const admin = createAdminClient()
  const { data } = await admin
    .from('profiles')
    .select('id')
    .eq('referral_code', code)
    .maybeSingle()
  return (data as any)?.id || null
}

export async function GET(req: NextRequest) {
  const url = new URL(req.url)
  const code = (url.searchParams.get('code') || '').trim()
  if (!code) return NextResponse.json({ ok: false, error: 'missing_code' }, { status: 400 })
  const jar = cookies()
  jar.set('ss_ref_code', code, { httpOnly: true, secure: true, sameSite: 'lax', path: '/', maxAge: 60 * 60 * 24 * 90 })
  return NextResponse.json({ ok: true })
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}))
  const code = (body.code || '').toString().trim()
  if (!code) return NextResponse.json({ ok: false, error: 'missing_code' }, { status: 400 })

  const supabase = createRouteHandlerClient({ cookies })
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    // Not logged in yet: persist cookie for later association
    const res = NextResponse.json({ ok: true, deferred: true })
    res.cookies.set('ss_ref_code', code, { httpOnly: true, secure: true, sameSite: 'lax', path: '/', maxAge: 60 * 60 * 24 * 90 })
    return res
  }

  const inviterId = await resolveInviterIdByCode(code)
  if (!inviterId || inviterId === user.id) return NextResponse.json({ ok: true, skipped: true })

  const admin = createAdminClient()
  await admin
    .from('referrals')
    .upsert({ user_id: inviterId, referred_id: user.id }, { onConflict: 'user_id,referred_id' })
  return NextResponse.json({ ok: true })
}

