import 'server-only'
import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { syncSubscriptionQuantityForOrg } from '@/lib/billing/seats'
import { seatLimitForOrg, countSeats } from '@/lib/org'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function admin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!
  return createClient(url, key, { auth: { persistSession: false } })
}

export async function GET(req: Request) {
  const url = new URL(req.url)
  const token = url.searchParams.get('token') || ''
  const sb = admin()
  const { data: inv } = await sb
    .from('org_invites')
    .select('id, org_id, email, expires_at, accepted_at')
    .eq('token', token)
    .maybeSingle()
  if (!inv) return NextResponse.redirect(`${process.env.NEXT_PUBLIC_APP_URL}/login?invite=invalid`)
  if ((inv as any).accepted_at) return NextResponse.redirect(`${process.env.NEXT_PUBLIC_APP_URL}/login?invite=used`)
  if (new Date((inv as any).expires_at) < new Date()) return NextResponse.redirect(`${process.env.NEXT_PUBLIC_APP_URL}/login?invite=expired`)
  // Seat limit guard
  const [limit, seats] = await Promise.all([seatLimitForOrg((inv as any).org_id), countSeats((inv as any).org_id)])
  if (limit !== null && seats >= limit) {
    return NextResponse.redirect(`${process.env.NEXT_PUBLIC_APP_URL}/dashboard/billing?status=error&from=seat_limit`)
  }
  const { data: userRow } = await sb.from('profiles').select('id').ilike('email', (inv as any).email).maybeSingle()
  if ((userRow as any)?.id) {
    await sb.from('org_members').upsert({ org_id: (inv as any).org_id, user_id: (userRow as any).id, role: 'member' })
  }
  await sb.from('org_invites').update({ accepted_at: new Date().toISOString() }).eq('id', (inv as any).id)
  await syncSubscriptionQuantityForOrg((inv as any).org_id)
  return NextResponse.redirect(`${process.env.NEXT_PUBLIC_APP_URL}/login?invite=accepted`)
}

