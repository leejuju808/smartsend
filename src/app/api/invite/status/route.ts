import 'server-only'
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs'
import { supabaseAdmin } from '@/server/supabase'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET() {
  const supabase = createRouteHandlerClient({ cookies })
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Count invited
  const { count: invited } = await supabaseAdmin
    .from('referrals')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', user.id)

  // Get referred ids
  const { data: referredRows } = await supabaseAdmin
    .from('referrals')
    .select('referred_id')
    .eq('user_id', user.id)

  const referredIds = (referredRows || []).map((r: any) => r.referred_id)
  let upgraded = 0
  if (referredIds.length > 0) {
    const { data: profiles } = await supabaseAdmin
      .from('profiles')
      .select('id, subscription_status')
      .in('id', referredIds)
    upgraded = (profiles || []).filter((p: any) => ['pro', 'active'].includes(p.subscription_status)).length
  }

  const { data: me } = await supabaseAdmin
    .from('profiles')
    .select('bonus_credit')
    .eq('id', user.id)
    .maybeSingle()

  const creditMonths = (me as any)?.bonus_credit || 0
  return NextResponse.json({ invited: invited || 0, upgraded, creditMonths })
}

