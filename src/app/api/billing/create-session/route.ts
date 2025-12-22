import { NextResponse } from 'next/server'
import { stripe } from '@/lib/stripe'
import { supabaseAdmin } from '@/server/supabase'

export async function POST(req: Request) {
  try {
    const { userId, priceId, coupon, refCode } = await req.json()
    if (!userId) return NextResponse.json({ error: 'Missing userId' }, { status: 400 })

    const price = priceId || process.env.NEXT_PUBLIC_STRIPE_PRICE_ID
    if (!price) return NextResponse.json({ error: 'Missing priceId' }, { status: 400 })

    const appUrl = (process.env.NEXT_PUBLIC_APP_URL as string).replace(/\/$/, '')

    // If a coupon string is provided, attempt to resolve as a Promotion Code
    let discounts: { promotion_code?: string }[] | undefined
    if (coupon && typeof coupon === 'string') {
      try {
        const promos = await stripe.promotionCodes.list({ code: String(coupon), active: true, limit: 1 })
        const found = promos.data?.[0]
        if (found?.id) discounts = [{ promotion_code: found.id }]
      } catch {}
    }

    // Build metadata with referral code if provided
    const metadata: Record<string, string> = { user_id: String(userId) }
    if (refCode) {
      metadata.ref = String(refCode)
    }

    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      customer_creation: 'if_required',
      line_items: [{ price, quantity: 1 }],
      ...(discounts ? { discounts } : { allow_promotion_codes: true }),
      success_url: `${appUrl}/dashboard?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${appUrl}/dashboard/billing`,
      metadata,
      subscription_data: {
        metadata: refCode ? { ref: String(refCode) } : {},
      },
    })

    if (session.customer) {
      await supabaseAdmin
        .from('profiles')
        .update({ stripe_customer_id: String(session.customer) })
        .eq('id', String(userId))
    }

    return NextResponse.json({ url: session.url })
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || 'Internal error' }, { status: 500 })
  }
}

