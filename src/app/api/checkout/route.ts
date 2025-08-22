import { NextRequest, NextResponse } from 'next/server'
import { stripe } from '@/lib/stripe'
import { track } from '@/lib/analytics'
import { createAdminClient } from '@/lib/supabase'

export async function POST(req: NextRequest) {
  try {
    const contentType = req.headers.get('content-type') || ''
    let priceId: string | undefined
    let successUrl: string | undefined
    let cancelUrl: string | undefined
    let userId: string | undefined
    let customerEmail: string | undefined
    let promo: string | undefined
    let planTerm: 'monthly' | 'annual' = 'monthly'
    let utm_source: string | undefined
    let utm_medium: string | undefined
    let utm_campaign: string | undefined

    if (contentType.includes('application/json')) {
      const body = await req.json()
      priceId = body.priceId
      successUrl = body.successUrl
      cancelUrl = body.cancelUrl
      userId = body.userId
      customerEmail = body.customer_email
      promo = body.promo
      utm_source = body.utm_source
      utm_medium = body.utm_medium
      utm_campaign = body.utm_campaign
      const termRaw = (body.planTerm || body.plan_term) as string | undefined
      if (termRaw === 'annual') planTerm = 'annual'
    } else {
      const form = await req.formData()
      priceId = form.get('priceId')?.toString()
      successUrl = form.get('successUrl')?.toString()
      cancelUrl = form.get('cancelUrl')?.toString()
      userId = form.get('userId')?.toString()
      customerEmail = form.get('customer_email')?.toString()
      promo = form.get('promo')?.toString()
      utm_source = form.get('utm_source')?.toString()
      utm_medium = form.get('utm_medium')?.toString()
      utm_campaign = form.get('utm_campaign')?.toString()
      const termRaw = form.get('plan_term')?.toString()
      if (termRaw === 'annual') planTerm = 'annual'
    }

    if (!process.env.NEXT_PUBLIC_APP_URL) {
      return NextResponse.json({ error: 'App URL not configured' }, { status: 400 })
    }

    const resolvedSuccessUrl =
      successUrl || `${process.env.NEXT_PUBLIC_APP_URL}/dashboard/billing?status=success`
    const resolvedCancelUrl =
      cancelUrl || `${process.env.NEXT_PUBLIC_APP_URL}/dashboard/billing?status=cancelled`

    const resolvedPriceId = priceId || (process.env.NEXT_PUBLIC_STRIPE_PRICE_ID as string)

    // Identify the current user via Supabase auth in cookies (if using RLS)
    // For simplicity in this route, we accept an authenticated session via headers (Next.js middleware could enforce)

    // Optional promo code handling: try to apply if valid; always allow entry on Stripe
    let discounts: { promotion_code: string }[] | undefined
    if (promo && typeof promo === 'string' && promo.trim()) {
      try {
        const found = await stripe.promotionCodes.list({ code: promo.trim(), active: true, limit: 1 })
        if (found.data[0]?.id) {
          discounts = [{ promotion_code: found.data[0].id }]
        }
      } catch {}
    }

    // Determine seat quantity based on org membership (if userId provided)
    let quantity = 1
    try {
      if (userId) {
        const sb = createAdminClient()
        const { data: prof } = await sb
          .from('profiles')
          .select('org_id')
          .eq('id', userId)
          .maybeSingle()
        const orgId = (prof as any)?.org_id as string | undefined
        if (orgId) {
          const { count } = await sb
            .from('org_members')
            .select('*', { count: 'exact', head: true })
            .eq('org_id', orgId)
          quantity = Math.max(1, count ?? 1)
        }
      }
    } catch {}

    // Derive variant for experiment tracking
    const variant = process.env.NEXT_PUBLIC_PRICE_VARIANT || 'standard'

    // Create Checkout Session for subscription
    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      payment_method_types: ['card'],
      line_items: [
        {
          price: resolvedPriceId,
          quantity,
        },
      ],
      success_url: resolvedSuccessUrl,
      cancel_url: resolvedCancelUrl,
      allow_promotion_codes: true,
      discounts,
      // ---- Tax & compliance ----
      billing_address_collection: 'required',
      automatic_tax: { enabled: true },
      tax_id_collection: { enabled: true },
      // ---- Identification ----
      customer_email: customerEmail || undefined,
      client_reference_id: userId || undefined,
      metadata: {
        userId: userId || '',
        price_id: resolvedPriceId,
        plan_term: planTerm,
        variant,
        ...(utm_source ? { utm_source } : {}),
        ...(utm_medium ? { utm_medium } : {}),
        ...(utm_campaign ? { utm_campaign } : {}),
      },
    })

    // Fire-and-forget analytics
    try {
      await track('checkout_started', {
        userId,
        priceId: resolvedPriceId,
        planTerm,
        promoTried: Boolean(promo),
        promoApplied: Boolean(discounts?.length),
        variant,
        utm_source,
        utm_medium,
        utm_campaign,
      })
    } catch {}

    return NextResponse.json({ id: session.id, url: session.url })
  } catch (error: any) {
    console.error('Checkout error', error)
    return NextResponse.json({ error: error.message ?? 'Internal error' }, { status: 500 })
  }
}

