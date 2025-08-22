'use server'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { createServerClient } from '@supabase/ssr'
import { stripe } from '@/lib/stripe'
import { getActivePriceId } from '@/lib/pricing'
import { getOrCreateDefaultOrgForUser, countSeats } from '@/lib/org'
import { syncSubscriptionQuantityForOrg } from '@/lib/billing/seats'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL as string
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string

export async function startSeatUpgrade(formData: FormData) {
  const desiredSeats = Number(formData.get('seats') || 1)
  const jar = cookies()
  const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      get(name: string) {
        return jar.get(name)?.value
      },
      set() {},
      remove() {},
    },
  })
  const { user, org } = await getOrCreateDefaultOrgForUser()
  if (!user || !org) redirect('/login')

  const { data: prof } = await supabase
    .from('profiles')
    .select('stripe_customer_id, subscription_status')
    .eq('id', (user as any).id)
    .maybeSingle()
  const customerId = (prof as any)?.stripe_customer_id as string | undefined
  const status = (prof as any)?.subscription_status as string | undefined
  const isPro = status === 'pro' || status === 'active' || status === 'trialing'

  if (!isPro || !customerId) {
    // kick off checkout with desired quantity on the price
    const priceId = getActivePriceId((process.env.NEXT_PUBLIC_PRICE_DEFAULT_TERM === 'annual') ? 'annual' : 'monthly')
    const successUrl = `${(process.env.NEXT_PUBLIC_APP_URL as string).replace(/\/$/, '')}/dashboard/billing?status=success`
    const cancelUrl = `${(process.env.NEXT_PUBLIC_APP_URL as string).replace(/\/$/, '')}/dashboard/billing?status=cancelled`
    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      payment_method_types: ['card'],
      line_items: [{ price: priceId, quantity: Math.max(1, desiredSeats) }],
      success_url: successUrl,
      cancel_url: cancelUrl,
      customer_email: undefined,
      metadata: { userId: (user as any).id, price_id: priceId, plan_term: process.env.NEXT_PUBLIC_PRICE_DEFAULT_TERM || 'monthly' },
      allow_promotion_codes: true,
      billing_address_collection: 'required',
      automatic_tax: { enabled: true },
      tax_id_collection: { enabled: true },
    })
    redirect(session.url!)
  }

  // Pro: update subscription quantity
  const subs = await stripe.subscriptions.list({ customer: customerId!, status: 'active', limit: 1 })
  const sub = subs.data[0]
  if (!sub) redirect('/dashboard/billing?status=error&from=no-active-sub')
  const item = sub.items.data[0]
  const currentSeats = await countSeats((org as any).id)
  const newQty = Math.max(currentSeats, Math.max(1, desiredSeats))
  await stripe.subscriptions.update(sub.id, {
    items: [{ id: item.id, quantity: newQty }],
    proration_behavior: 'create_prorations',
    payment_behavior: 'allow_incomplete',
    off_session: true,
  })
  await syncSubscriptionQuantityForOrg((org as any).id)
  redirect('/dashboard/account')
}

'use server'
import { cookies } from 'next/headers'
import { createServerClient } from '@supabase/ssr'
import { createClient } from '@supabase/supabase-js'
import { stripe } from '@/lib/stripe'
import { countSeats, seatLimitForOrg } from '@/lib/org'
import { getActivePriceId } from '@/lib/pricing'
import { track } from '@/lib/analytics'
import { redirect } from 'next/navigation'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL as string
const supabaseAnon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string

function admin() {
  return createClient(supabaseUrl, process.env.SUPABASE_SERVICE_ROLE_KEY as string, { auth: { persistSession: false } })
}

export async function startSeatUpgrade(formData?: FormData) {
  const jar = cookies()
  const supa = createServerClient(supabaseUrl, supabaseAnon, {
    cookies: { get: (n: string) => jar.get(n)?.value, set() {}, remove() {} },
  })
  const { data: { user } } = await supa.auth.getUser()
  if (!user) redirect('/login')

  const a = admin()
  const { data: prof } = await a.from('profiles').select('org_id, plan_interval, stripe_customer_id, email').eq('id', user.id).maybeSingle()
  const orgId = (prof as any)?.org_id as string | undefined
  if (!orgId) throw new Error('no_org')
  const currentSeats = await countSeats(orgId)
  const desired = Math.max(currentSeats + 1, Number(formData?.get('seats') ?? (currentSeats + 1)))
  const limit = await seatLimitForOrg(orgId)
  if (limit !== null && desired > limit) {
    redirect('/dashboard/billing?status=error&from=seat_limit')
  }

  const customerId = (prof as any)?.stripe_customer_id as string | undefined
  if (customerId) {
    const subs = await stripe.subscriptions.list({ customer: customerId, status: 'active', limit: 1 })
    const sub = subs.data[0]
    if (sub?.items?.data?.length) {
      const item = sub.items.data[0]
      const oldQty = item.quantity ?? 1
      if (desired <= oldQty) {
        redirect('/dashboard/billing?status=success')
      }
      await stripe.subscriptions.update(sub.id, {
        items: [{ id: item.id, quantity: desired }],
        proration_behavior: 'create_prorations',
        payment_behavior: 'allow_incomplete',
        off_session: true,
      })
      await a.from('seat_audits').insert({ org_id: orgId, actor_id: user.id, type: 'upgrade_quantity', delta: desired - oldQty, old_qty: oldQty, new_qty: desired })
      await track('seat_quantity_changed', { userId: user.id, orgId, newQty: desired })
      redirect('/dashboard/billing?status=success')
    }
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL as string
  const term = ((prof as any)?.plan_interval === 'year') ? 'annual' : 'monthly'
  const priceId = getActivePriceId(term as 'monthly' | 'annual')
  const success = `${appUrl.replace(/\/$/, '')}/dashboard/billing?status=success`
  const cancel = `${appUrl.replace(/\/$/, '')}/dashboard/billing?status=cancelled`
  const session = await stripe.checkout.sessions.create({
    mode: 'subscription',
    payment_method_types: ['card'],
    line_items: [{ price: priceId, quantity: desired }],
    success_url: success,
    cancel_url: cancel,
    billing_address_collection: 'required',
    automatic_tax: { enabled: true },
    tax_id_collection: { enabled: true },
    client_reference_id: user.id,
    customer_email: (prof as any)?.email ?? undefined,
    metadata: { userId: user.id, price_id: priceId, plan_term: term, seat_upgrade: 'true', desired_seats: String(desired) },
  })
  redirect(session.url!)
}

