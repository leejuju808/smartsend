import 'server-only'
import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createAdminClient, createServerComponentClient } from '@/lib/supabase'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  const supa = createServerComponentClient()
  const { data: { user } } = await supa.auth.getUser()
  if (!user) return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 })

  const url = new URL(req.url)
  const fromQuery = (url.searchParams.get('ref') || '').toString().trim()
  const jar = cookies()
  const fromCookie = jar.get('ss_ref_code')?.value
  const ref = fromQuery || fromCookie
  if (!ref) return NextResponse.json({ ok: false, error: 'missing_ref' }, { status: 400 })

  const admin = createAdminClient()
  // Resolve code -> inviter id
  const { data: inviter } = await admin
    .from('profiles')
    .select('id')
    .eq('referral_code', ref)
    .maybeSingle()
  const inviterId = (inviter as any)?.id
  if (!inviterId || inviterId === user.id) return NextResponse.json({ ok: true, skipped: true })

  // Try to update existing pending referral by email
  const { data: existing } = await admin
    .from('referrals')
    .select('id,status')
    .eq('inviter', inviterId)
    .eq('email', user.email?.toLowerCase() || '')
    .maybeSingle()

  if (existing) {
    await admin
      .from('referrals')
      .update({ invitee: user.id, status: 'joined' })
      .eq('id', (existing as any).id)
  } else {
    // Create referral association if none by email
    await admin
      .from('referrals')
      .upsert({ inviter: inviterId, invitee: user.id, email: (user.email || '').toLowerCase(), status: 'joined' })
  }

  return NextResponse.json({ ok: true })
}

