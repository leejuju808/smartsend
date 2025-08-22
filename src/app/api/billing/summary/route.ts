import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/server/supabase'

const CAPS = { free: 50, pro: 500 } as const

// TEMP: Replace with real auth/session
async function getUserId(req: Request) {
  const url = new URL(req.url)
  return url.searchParams.get('userId')
}

export async function GET(req: Request) {
  try {
    const userId = await getUserId(req)
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { data: prof, error } = await supabaseAdmin
      .from('profiles')
      .select('subscription_status, stripe_customer_id, credit_months')
      .eq('id', String(userId))
      .single()

    if (error || !prof) return NextResponse.json({ error: 'Profile not found' }, { status: 404 })

    const plan = (prof as any).subscription_status === 'pro' ? 'pro' : 'free'
    const limit = CAPS[plan as keyof typeof CAPS]

    return NextResponse.json({
      plan,
      status: (prof as any).subscription_status,
      daily_limit: limit,
      stripe_customer_id: (prof as any).stripe_customer_id,
      credit_months: (prof as any).credit_months ?? 0,
    })
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || 'Internal error' }, { status: 500 })
  }
}

