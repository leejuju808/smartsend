'use server'
import { cookies as getCookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { createServerClient } from '@supabase/ssr'
import { stripe } from '@/lib/stripe'
import { getActivePriceId } from '@/lib/pricing'
import { createClient } from '@supabase/supabase-js'
import { track } from '@/lib/analytics'
import { captureError } from '@/lib/monitoring/sentry'
import { sendEmail } from '@/lib/notify/mailer'
import { revalidatePath } from 'next/cache'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL as string
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string
function admin() {
  return createClient(supabaseUrl, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } })
}

export async function switchToAnnual() {
  try {
    const jar = await getCookies()
    const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
      cookies: {
        get(name: string) {
          return jar.get(name)?.value
        },
        set() {},
        remove() {},
      },
    })

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) redirect('/login')

    const { data: row } = await supabase
      .from('profiles')
      .select('stripe_customer_id, plan_interval')
      .eq('id', user.id)
      .maybeSingle()
    const customerId = (row as any)?.stripe_customer_id as string | undefined
    const planInterval = (row as any)?.plan_interval as string | null
    if (!customerId) {
      redirect('/dashboard/billing?status=error&from=switch-annual')
    }
    if (planInterval === 'year') {
      redirect('/dashboard/billing?status=success&switched=annual')
    }

    const annualPriceId = getActivePriceId('annual')
    const subs = await stripe.subscriptions.list({ customer: customerId!, status: 'active', limit: 1 })
    const sub = subs.data[0]
    if (!sub) {
      redirect('/dashboard/billing?status=error&from=no-active-sub')
    }
    const annualPrice = await stripe.prices.retrieve(annualPriceId)
    const target = sub.items.data.find(
      (it) => it.price?.recurring?.interval === 'month' && it.price?.product === annualPrice.product,
    ) || sub.items.data[0]

    await stripe.subscriptions.update(sub.id, {
      items: [{ id: target.id, price: annualPriceId }],
      proration_behavior: 'create_prorations',
      payment_behavior: 'allow_incomplete',
      off_session: true,
    })
    await track('switched_to_annual', { userId: user.id, subscriptionId: sub.id, toPrice: annualPriceId })
    redirect('/dashboard/billing?status=success&switched=annual')
  } catch (err: any) {
    console.error('switchToAnnual error', err)
    throw err
  }
}

export async function applySaveOffer(formData?: FormData) {
  try {
    const jar = await getCookies()
    const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
      cookies: {
        get(name: string) {
          return jar.get(name)?.value
        },
        set() {},
        remove() {},
      },
    })
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) redirect('/login')

    const { data: row } = await supabase.from('profiles')
      .select('id, stripe_customer_id')
      .eq('id', user.id)
      .maybeSingle()
    const customerId = (row as any)?.stripe_customer_id as string | undefined
    if (!customerId) redirect('/dashboard/billing?status=error&from=apply-offer-no-customer')

    const subs = await stripe.subscriptions.list({ customer: customerId, status: 'active', limit: 1 })
    const sub = subs.data[0]
    if (!sub) redirect('/dashboard/billing?status=error&from=apply-offer-no-sub')

    const promotionCode = process.env.SAVE_PROMOTION_CODE
    const coupon = process.env.SAVE_COUPON_ID
    if (!promotionCode && !coupon) {
      redirect('/dashboard/billing?status=error&from=apply-offer-missing-code')
    }
    await stripe.subscriptions.update(sub.id, {
      discounts: promotionCode ? [{ promotion_code: promotionCode }] : [{ coupon: coupon! }],
      payment_behavior: 'allow_incomplete',
      proration_behavior: 'none',
    })
    await track('save_offer_applied', { userId: user.id, subscriptionId: sub.id, via: promotionCode ? 'promotion_code' : 'coupon' })
    await supabase.from('churn_intents').insert({ user_id: user.id, reason: (formData?.get('reason')?.toString() ?? null), offer_applied: true })
    redirect('/dashboard/billing?status=success')
  } catch (err: any) {
    console.error('applySaveOffer error', err)
    throw err
  }
}

export async function beginCancelFlow(formData?: FormData) {
  try {
    const reason = formData?.get('reason')?.toString() ?? null
    const jar = await getCookies()
    const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
      cookies: {
        get(name: string) {
          return jar.get(name)?.value
        },
        set() {},
        remove() {},
      },
    })
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) redirect('/login')
    await supabase.from('churn_intents').insert({ user_id: user.id, reason, offer_applied: false })
    await track('cancel_intent', { userId: user.id, reason })

    const { data: prof } = await supabase.from('profiles').select('stripe_customer_id').eq('id', user.id).maybeSingle()
    const portal = await stripe.billingPortal.sessions.create({
      customer: (prof as any)?.stripe_customer_id as string,
      return_url: `${(process.env.NEXT_PUBLIC_APP_URL as string).replace(/\/$/, '')}/dashboard/billing?status=success`,
    })
    redirect(portal.url)
  } catch (err: any) {
    console.error('beginCancelFlow error', err)
    throw err
  }
}

export async function scheduleSwitchToMonthlyAtRenewal() {
  try {
    const jar = await getCookies()
    const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
      cookies: {
        get(name: string) {
          return jar.get(name)?.value
        },
        set() {},
        remove() {},
      },
    })
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) redirect('/login')

    const { data: row } = await supabase.from('profiles')
      .select('stripe_customer_id')
      .eq('id', user.id)
      .maybeSingle()
    const customerId = (row as any)?.stripe_customer_id as string | undefined
    if (!customerId) redirect('/dashboard/billing?status=error&from=switch-month-no-customer')
    const subs = await stripe.subscriptions.list({ customer: customerId, status: 'active', limit: 1 })
    const sub = subs.data[0]
    if (!sub) redirect('/dashboard/billing?status=error&from=switch-month-no-sub')

    const monthlyPriceId = getActivePriceId('monthly')
    const currentPrice = sub.items.data[0].price?.id
    if (currentPrice === monthlyPriceId) {
      redirect('/dashboard/billing?status=success')
    }
    await stripe.subscriptionSchedules.create({
      from_subscription: sub.id,
      phases: [
        { items: [{ price: currentPrice! }], end_date: (sub as any).current_period_end },
        { items: [{ price: monthlyPriceId }] },
      ],
      end_behavior: 'release',
    })
    await track('scheduled_switch_to_monthly', { userId: user.id, subscriptionId: sub.id, toPrice: monthlyPriceId })
    redirect('/dashboard/billing?status=success&switched=monthly_scheduled')
  } catch (err: any) {
    console.error('scheduleSwitchToMonthlyAtRenewal error', err)
    throw err
  }
}

export async function openPaymentMethodUpdatePortal() {
  const cookieStore = await getCookies()
  const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      get(name: string) {
        return cookieStore.get(name)?.value
      },
      set() {},
      remove() {},
    },
  })
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  const appUrl = (process.env.NEXT_PUBLIC_APP_URL as string).replace(/\/$/, '')

  // Resolve Stripe customer
  const { data: prof } = await createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      get: (n: string) => cookieStore.get(n)?.value,
      set() {},
      remove() {},
    },
  })
    .from('profiles')
    .select('stripe_customer_id')
    .eq('id', user.id)
    .maybeSingle()
  const customerId = (prof as any)?.stripe_customer_id as string | undefined
  if (!customerId) redirect('/dashboard/billing?status=error&from=no-customer')

  const portal = await stripe.billingPortal.sessions.create({
    customer: customerId,
    return_url: `${appUrl}/dashboard/billing?from=portal`,
    // Attempt to deep-link to payment method update flow when supported
    flow_data: { type: 'payment_method_update' } as any,
  })
  redirect(portal.url)
}

/** Start a discounted checkout (rescue offer) using a pre-created coupon. */
export async function startRescueOffer() {
  try {
    const cookieStore = await getCookies()
    const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
      cookies: { get: (n: string) => cookieStore.get(n)?.value, set(){}, remove(){} },
    })
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) redirect('/login')
    const appUrl = (process.env.NEXT_PUBLIC_APP_URL as string).replace(/\/$/, '')
    const priceId = process.env.NEXT_PUBLIC_STRIPE_PRICE_ID as string
    const coupon = process.env.STRIPE_RESCUE_COUPON_ID as string | undefined
    if (!appUrl || !priceId || !coupon) {
      throw new Error('Rescue offer not configured')
    }
    const success = `${appUrl}/dashboard/billing?status=success`
    const cancel = `${appUrl}/dashboard/billing?status=cancelled`
    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      payment_method_types: ['card'],
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: success,
      cancel_url: cancel,
      discounts: [{ coupon }],
      metadata: { userId: user.id, rescue: 'true' },
      customer_email: (user as any).email ?? undefined,
      allow_promotion_codes: true,
    })
    await track('rescue_offer_started', { userId: user.id })
    redirect(session.url!)
  } catch (err: any) {
    captureError(err, { route: 'startRescueOffer' })
    throw err
  }
}

// Create a plain Stripe customer portal session (no deep-link flow)
export async function createCustomerPortalSession() {
  const jar = await getCookies()
  const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      get(name: string) { return jar.get(name)?.value },
      set() {},
      remove() {},
    },
  })
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  const { data: prof } = await admin().from('profiles').select('stripe_customer_id').eq('id', user.id).maybeSingle()
  const customerId = (prof as any)?.stripe_customer_id as string | undefined
  if (!customerId) redirect('/dashboard/billing?status=error&from=no-customer')
  const appUrl = (process.env.NEXT_PUBLIC_APP_URL as string).replace(/\/$/, '')
  const portal = await stripe.billingPortal.sessions.create({
    customer: customerId,
    return_url: `${appUrl}/dashboard/billing`,
  })
  redirect(portal.url)
}

// (old submitCancelFeedbackThenPortal removed; see new implementation below)

/** Deep-link directly to Stripe Portal cancellation flow (best-effort). */
export async function openCancelPortal() {
  const cookieStore = await getCookies()
  const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      get(name: string) { return cookieStore.get(name)?.value },
      set() {},
      remove() {},
    },
  })
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  const { data: prof } = await admin().from('profiles').select('stripe_customer_id').eq('id', user.id).maybeSingle()
  const customerId = (prof as any)?.stripe_customer_id as string | undefined
  if (!customerId) redirect('/dashboard/billing?status=error&from=no-customer')
  const appUrl = (process.env.NEXT_PUBLIC_APP_URL as string).replace(/\/$/, '')
  const portal = await stripe.billingPortal.sessions.create({
    customer: customerId,
    return_url: `${appUrl}/dashboard/billing?from=portal`,
    // Deep-link to cancellation flow when supported
    flow_data: { type: 'subscription_cancel' } as any,
  })
  redirect(portal.url)
}

/** A/B/C rescue offer variant with different coupons. Hidden input `variant` required. */
export async function startRescueOfferVariant(formData: FormData) {
  try {
    const variant = String(formData.get('variant') || 'A')
    const coupon =
      (variant === 'A' && process.env.STRIPE_RESCUE_COUPON_ID_A) ||
      (variant === 'B' && process.env.STRIPE_RESCUE_COUPON_ID_B) ||
      (variant === 'C' && process.env.STRIPE_RESCUE_COUPON_ID_C) ||
      process.env.STRIPE_RESCUE_COUPON_ID
    if (!coupon) throw new Error('Rescue coupon for variant not configured')
    const jar = await getCookies()
    const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
      cookies: {
        get(name: string) { return jar.get(name)?.value },
        set() {},
        remove() {},
      },
    })
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) redirect('/login')
    const appUrl = (process.env.NEXT_PUBLIC_APP_URL as string).replace(/\/$/, '')
    const priceId = process.env.NEXT_PUBLIC_STRIPE_PRICE_ID as string
    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      payment_method_types: ['card'],
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${appUrl}/dashboard/billing?status=success`,
      cancel_url: `${appUrl}/dashboard/billing?status=cancelled`,
      discounts: [{ coupon }],
      metadata: { userId: user.id, rescue: 'true', variant },
      customer_email: user.email ?? undefined,
      allow_promotion_codes: true,
    })
    await track('rescue_variant_redeemed', { userId: user.id, variant })
    redirect(session.url!)
  } catch (err: any) {
    captureError(err, { route: 'startRescueOfferVariant' })
    throw err
  }
}

/** Save cancel feedback and then open the cancellation portal. */
export async function submitCancelFeedbackThenPortal(formData: FormData) {
  try {
    const jar = await getCookies()
    const supa = createServerClient(supabaseUrl, supabaseAnonKey, {
      cookies: {
        get(name: string) { return jar.get(name)?.value },
        set() {},
        remove() {},
      },
    })
    const { data: { user } } = await supa.auth.getUser()
    if (!user) redirect('/login')
    const reason = String(formData.get('reason') || 'other')
    const note = String(formData.get('note') || '').slice(0, 2000)
    await admin().from('cancellation_feedback').insert({ user_id: user.id, reason, note })
    await track('cancel_feedback_saved', { userId: user.id, reason })
    // Send tailored follow-up
    const email = (user as any).email as string | undefined
    if (email) {
      const appUrl = (process.env.NEXT_PUBLIC_APP_URL as string).replace(/\/$/, '')
      const roadmap = process.env.ROADMAP_URL || `${appUrl}/roadmap`
      let subject = 'Thanks for the feedback'
      let text =
        `Thanks for telling us why you’re canceling.\n\nYou can manage your subscription here:\n${appUrl}/dashboard/billing/manage`
      if (reason === 'missing_features') {
        subject = 'We’re building fast — want to follow along?'
        text =
          `Totally fair. Here’s our roadmap and request board:\n${roadmap}\n\n` +
          `If we ship what you need, you can re-activate any time:\n${appUrl}/dashboard/billing/manage`
      } else if (reason === 'bugs_or_quality') {
        subject = 'We’re fixing things — can you share details?'
        text =
          `Sorry about the bumps. If you can reply with details, we’ll jump on it.\n\n` +
          `Meanwhile, you can always re-activate here:\n${appUrl}/dashboard/billing/manage`
      } else if (reason === 'too_expensive') {
        subject = 'A little help on price'
        text =
          `If cost is the issue, we can offer a discounted plan here:\n${appUrl}/dashboard/billing/manage\n\n` +
          `Either way, thanks for trying us.`
      }
      await sendEmail({ to: email, subject, text })
    }
    // now open portal in cancel mode
    const { data: prof } = await admin().from('profiles').select('stripe_customer_id').eq('id', user.id).maybeSingle()
    const customerId = (prof as any)?.stripe_customer_id as string | undefined
    if (!customerId) redirect('/dashboard/billing?status=error&from=no-customer')
    const appUrl = (process.env.NEXT_PUBLIC_APP_URL as string).replace(/\/$/, '')
    const portal = await stripe.billingPortal.sessions.create({
      customer: customerId,
      return_url: `${appUrl}/dashboard/billing?from=portal`,
      flow_data: { type: 'subscription_cancel' } as any,
    })
    redirect(portal.url)
  } catch (err: any) {
    captureError(err, { route: 'submitCancelFeedbackThenPortal' })
    throw err
  }
}

/** Apply one referral credit month by attaching a 100% off, one-cycle coupon to the active subscription and decrementing credits. */
export async function applyReferralCredit() {
  const jar = await getCookies()
  const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: { get: (n: string) => jar.get(n)?.value, set(){}, remove(){} },
  })
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  // Fetch profile for customer + credit balance
  const { data: prof } = await admin().from('profiles').select('stripe_customer_id, credit_months, bonus_credit').eq('id', user.id).maybeSingle()
  const customerId = (prof as any)?.stripe_customer_id as string | undefined
  const bonus = Number((prof as any)?.bonus_credit || 0)
  const legacy = Number((prof as any)?.credit_months || 0)
  const credits = bonus > 0 ? bonus : legacy
  if (!customerId || credits <= 0) {
    redirect('/dashboard/billing/manage?status=error&from=no-credits')
  }
  // Find active subscription
  const subs = await stripe.subscriptions.list({ customer: customerId, status: 'active', limit: 1 })
  const sub = subs.data[0]
  if (!sub) redirect('/dashboard/billing/manage?status=error&from=no-sub')

  // Resolve coupon to apply: env STRIPE_REFERRAL_COUPON_ID or fallback to create a one-time 100% off coupon
  let couponId = process.env.STRIPE_REFERRAL_COUPON_ID as string | undefined
  if (!couponId) {
    const coupon = await stripe.coupons.create({ percent_off: 100, duration: 'once', name: 'Referral credit' })
    couponId = coupon.id
  }

  await stripe.subscriptions.update(sub.id, {
    discounts: [{ coupon: couponId! }],
    proration_behavior: 'none',
    payment_behavior: 'allow_incomplete',
  })
  // Decrement one credit month, prefer bonus_credit then legacy credit_months
  const { data: cur } = await admin().from('profiles').select('bonus_credit, credit_months').eq('id', user.id).maybeSingle()
  const curBonus = Number((cur as any)?.bonus_credit || 0)
  const curLegacy = Number((cur as any)?.credit_months || 0)
  if (curBonus > 0) {
    await admin().from('profiles').update({ bonus_credit: Math.max(0, curBonus - 1) }).eq('id', user.id)
  } else if (curLegacy > 0) {
    try {
      await admin().rpc('add_credit_month', { p_user_id: user.id, p_delta: -1 })
    } catch {
      const newBal = Math.max(0, curLegacy - 1)
      await admin().from('profiles').update({ credit_months: newBal }).eq('id', user.id)
    }
  }
  await track('referral_credit_applied', { userId: user.id, subscriptionId: sub.id })
  revalidatePath('/dashboard/billing/manage')
  redirect('/dashboard/billing/manage?status=success&from=referral')
}
