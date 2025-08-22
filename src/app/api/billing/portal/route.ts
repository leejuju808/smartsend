import { NextResponse } from 'next/server'
import { stripe } from '@/lib/stripe'
import { supabaseAdmin } from '@/server/supabase'

// TEMP: Replace with real auth/session
async function getUserId(req: Request) {
  const url = new URL(req.url)
  return url.searchParams.get('userId')
}

export async function POST(req: Request) {
  try {
    const userId = await getUserId(req)
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { data: prof, error } = await supabaseAdmin
      .from('profiles')
      .select('stripe_customer_id')
      .eq('id', String(userId))
      .single()

    if (error || !prof?.stripe_customer_id) {
      return NextResponse.json({ error: 'Missing stripe_customer_id' }, { status: 400 })
    }

    const baseUrl = (process.env.NEXT_PUBLIC_SITE_URL || process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000').replace(/\/$/, '')
    const session = await stripe.billingPortal.sessions.create({
      customer: String(prof.stripe_customer_id),
      return_url: `${baseUrl}/dashboard/billing?from=portal`,
    })

    return NextResponse.json({ url: session.url })
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || 'Internal error' }, { status: 500 })
  }
}

