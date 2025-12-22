import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
const STRIPE_KEY = Deno.env.get('STRIPE_SECRET_KEY')!
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const APP_URL = Deno.env.get('APP_URL')!  // e.g., https://app.smartsendhq.com

type Json = Record<string, any>

Deno.serve(async (req) => {
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 })
  const body = await req.json()
  const { action, project_id, price_id } = body as { action: 'checkout'|'portal', project_id: string, price_id?: string }

  const { createClient } = await import("npm:@supabase/supabase-js")
  const sb = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } })

  // identify user from Authorization (JWT)
  const authHeader = req.headers.get('Authorization') || ''
  const jwt = authHeader.replace('Bearer ', '')
  const { data: userRes } = await sb.auth.getUser(jwt)
  const user = userRes?.user
  if (!user) return new Response('Unauthorized', { status: 401 })

  // ensure project membership
  const { data: member } = await sb.from('project_members')
    .select('project_id').eq('project_id', project_id).eq('user_id', user.id).single()
  if (!member) return new Response('Forbidden', { status: 403 })

  const stripeMod = await import("npm:stripe@12.18.0")
  const stripe = new stripeMod.default(STRIPE_KEY, { httpClient: stripeMod.createFetchHttpClient() })

  // fetch or create stripe customer
  let customerId: string
  const { data: sc } = await sb.from('stripe_customers').select('customer_id').eq('user_id', user.id).single()
  if (sc?.customer_id) {
    customerId = sc.customer_id
  } else {
    const customer = await stripe.customers.create({
      email: user.email ?? undefined,
      metadata: { user_id: user.id }
    })
    customerId = customer.id
    await sb.from('stripe_customers').insert({ user_id: user.id, customer_id: customerId })
  }

  if (action === 'checkout') {
    if (!price_id) return new Response('Missing price_id', { status: 400 })
    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      customer: customerId,
      line_items: [{ price: price_id, quantity: 1 }],
      success_url: `${APP_URL}/settings/billing?success=1&project=${project_id}`,
      cancel_url: `${APP_URL}/settings/billing?canceled=1&project=${project_id}`,
      metadata: { project_id: project_id, user_id: user.id }
    })
    return resp({ url: session.url })
  }

  if (action === 'portal') {
    const portal = await stripe.billingPortal.sessions.create({
      customer: customerId,
      return_url: `${APP_URL}/settings/billing?project=${project_id}`
    })
    return resp({ url: portal.url })
  }

  return new Response('Unknown action', { status: 400 })
})

function resp(obj: Json, status=200) {
  return new Response(JSON.stringify(obj), { status, headers: { 'Content-Type': 'application/json' } })
}

