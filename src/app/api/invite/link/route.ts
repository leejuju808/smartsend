import 'server-only'
import { cookies } from 'next/headers'
import { NextRequest, NextResponse } from 'next/server'
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs'
import { createAdminClient } from '@/lib/supabase'
import { randomBytes } from 'crypto'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function generateReferralCode(): string {
  // 8-char url-safe base36-ish code
  const bytes = randomBytes(6)
  return Array.from(bytes).map(b => (b % 36).toString(36)).join('').slice(0, 8)
}

export async function GET(req: NextRequest) {
  const supabase = createRouteHandlerClient({ cookies })
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const admin = createAdminClient()
  let code: string | null = null

  // Fetch or create referral_code
  const { data: profile } = await admin
    .from('profiles')
    .select('id, referral_code')
    .eq('id', user.id)
    .maybeSingle()

  code = (profile as any)?.referral_code || null
  if (!code) {
    // Try a few times to avoid unique collisions
    for (let i = 0; i < 3; i++) {
      const attempt = generateReferralCode()
      const { error } = await admin
        .from('profiles')
        .update({ referral_code: attempt })
        .eq('id', user.id)
      if (!error) { code = attempt; break }
      if (error && !String(error.message).includes('duplicate key')) break
    }
  }

  if (!code) return NextResponse.json({ error: 'Failed to assign referral code' }, { status: 500 })

  const base = process.env.NEXT_PUBLIC_APP_URL || new URL(req.url).origin
  const link = `${base}/signup?ref=${encodeURIComponent(code)}`
  return NextResponse.json({ link, code })
}

