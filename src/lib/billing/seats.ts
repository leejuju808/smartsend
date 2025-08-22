import 'server-only'
import { stripe } from '@/lib/stripe'
import { createClient } from '@supabase/supabase-js'
import { countSeats } from '@/lib/org'

function admin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!
  return createClient(url, key, { auth: { persistSession: false } })
}

export async function syncSubscriptionQuantityForOrg(orgId: string) {
  const sb = admin()
  const { data: owner } = await sb
    .from('orgs')
    .select('owner_id')
    .eq('id', orgId)
    .maybeSingle()
  if (!(owner as any)?.owner_id) return
  const { data: prof } = await sb
    .from('profiles')
    .select('stripe_customer_id')
    .eq('id', (owner as any).owner_id)
    .maybeSingle()
  const customerId = (prof as any)?.stripe_customer_id as string | undefined
  if (!customerId) return
  const seats = Math.max(1, await countSeats(orgId))
  const subs = await stripe.subscriptions.list({ customer: customerId, status: 'active', limit: 1 })
  const sub = subs.data[0]
  if (!sub) return
  const item = sub.items.data[0]
  if (!item) return
  if ((item.quantity ?? 1) === seats) return
  await stripe.subscriptions.update(sub.id, {
    items: [{ id: item.id, quantity: seats }],
    proration_behavior: 'create_prorations',
    payment_behavior: 'allow_incomplete',
    off_session: true,
  })
}

