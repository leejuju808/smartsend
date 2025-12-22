// supabase/functions/stripe-usage/index.ts
import 'jsr:@supabase/functions-js/edge-runtime.d.ts'

const STRIPE_KEY = Deno.env.get('STRIPE_SECRET_KEY')!
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_KEY')!
const CRON_SECRET = Deno.env.get('CRON_SECRET')! // reuse as server-to-server auth

Deno.serve(async (req) => {
  if (req.headers.get('authorization') !== `Bearer ${CRON_SECRET}`) {
    return new Response('unauthorized', { status: 401 })
  }

  const body = await req.json() as { user_id: string, quantity: number }
  const { createClient } = await import('https://esm.sh/@supabase/supabase-js@2')
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, { auth: { persistSession: false } })

  const { data: acct, error } = await supabase
    .from('billing_accounts')
    .select('stripe_subscription_id,stripe_price_id')
    .eq('user_id', body.user_id).single()
  if (error || !acct?.stripe_subscription_id || !acct?.stripe_price_id) {
    return new Response('no-subscription', { status: 400 })
  }

  // Stripe: fetch subscription items for this subscription
  const res = await fetch(`https://api.stripe.com/v1/subscription_items?subscription=${acct.stripe_subscription_id}`, {
    method: 'GET',
    headers: { Authorization: `Bearer ${STRIPE_KEY}` }
  })
  const j = await res.json()
  const item = (j.data || []).find((si: any) =>
    si.price?.id === acct.stripe_price_id
  )
  if (!item) return new Response('no-subscription-item', { status: 400 })

  const ur = await fetch(`https://api.stripe.com/v1/subscription_items/${item.id}/usage_records`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${STRIPE_KEY}`, 'Content-Type':'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      quantity: String(body.quantity),
      timestamp: String(Math.floor(Date.now()/1000)),
      action: 'increment'
    })
  })
  if (!ur.ok) {
    const msg = await ur.text()
    return new Response(msg, { status: 400 })
  }

  // Update MTD locally (authoritative for gating)
  await supabase.rpc('billing_add_usage', { p_user: body.user_id, p_qty: body.quantity })

  return new Response('ok')
})

