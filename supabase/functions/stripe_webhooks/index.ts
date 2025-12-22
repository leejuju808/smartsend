import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
const STRIPE_KEY = Deno.env.get('STRIPE_SECRET_KEY')!
const WEBHOOK_SECRET = Deno.env.get('STRIPE_WEBHOOK_SECRET')!
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

Deno.serve(async (req) => {
  const raw = await req.text()
  const stripeMod = await import("npm:stripe@12.18.0")
  const stripe = new stripeMod.default(STRIPE_KEY, { httpClient: stripeMod.createFetchHttpClient() })

  let event
  try {
    const sig = req.headers.get('stripe-signature')!
    event = stripe.webhooks.constructEvent(raw, sig, WEBHOOK_SECRET)
  } catch (e:any) {
    return new Response(`Webhook signature verification failed: ${e.message}`, { status: 400 })
  }

  const { createClient } = await import("npm:@supabase/supabase-js")
  const sb = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } })

  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object as any
        // Retrieve subscription if mode is 'subscription'
        if (session.mode === 'subscription' && session.subscription) {
          const subscriptionId = typeof session.subscription === 'string' 
            ? session.subscription 
            : session.subscription.id
          
          // Fetch subscription to get price_id and other details
          const subscription = await stripe.subscriptions.retrieve(subscriptionId)
          const priceId = subscription.items?.data?.[0]?.price?.id
          const planId = await mapPriceToPlan(sb, priceId)

          // Get project_id & user_id from checkout session metadata
          const projectId = session.metadata?.project_id || null
          const userId = session.metadata?.user_id || null

          if (projectId && userId && priceId) {
            await sb.from('subscriptions').upsert({
              id: subscription.id,
              project_id: projectId,
              user_id: userId,
              customer_id: session.customer,
              price_id: priceId,
              plan_id: planId,
              status: subscription.status,
              current_period_end: subscription.current_period_end 
                ? new Date(subscription.current_period_end * 1000).toISOString() 
                : null,
              cancel_at_period_end: !!subscription.cancel_at_period_end
            }, { onConflict: 'id' })
          }
        }
        break
      }
      case 'customer.subscription.created':
      case 'customer.subscription.updated': {
        const sub = event.data.object as any
        const priceId = sub.items?.data?.[0]?.price?.id
        const planId = await mapPriceToPlan(sb, priceId)

        // For updates, try to get project_id from existing subscription first
        let projectId = sub.metadata?.project_id || null
        let userId = sub.metadata?.user_id || null

        // If not in metadata, try to get from existing subscription
        if (!projectId && event.type === 'customer.subscription.updated') {
          const { data: existing } = await sb
            .from('subscriptions')
            .select('project_id, user_id')
            .eq('id', sub.id)
            .single()
          if (existing) {
            projectId = projectId || existing.project_id
            userId = userId || existing.user_id
          }
        }

        // Only upsert if we have the required fields
        if (projectId && userId && priceId) {
          await sb.from('subscriptions').upsert({
            id: sub.id,
            project_id: projectId,
            user_id: userId,
            customer_id: sub.customer,
            price_id: priceId,
            plan_id: planId,
            status: sub.status,
            current_period_end: sub.current_period_end ? new Date(sub.current_period_end * 1000).toISOString() : null,
            cancel_at_period_end: !!sub.cancel_at_period_end
          }, { onConflict: 'id' })
        }
        break
      }
      case 'customer.subscription.deleted': {
        const sub = event.data.object as any
        await sb.from('subscriptions').update({ status: 'canceled' }).eq('id', sub.id)
        break
      }
    }
    return new Response('ok', { status: 200 })
  } catch (e:any) {
    return new Response(e?.message || String(e), { status: 500 })
  }
})

async function mapPriceToPlan(sb: any, priceId: string): Promise<string> {
  const { data } = await sb.from('plans').select('id').eq('stripe_price_id', priceId).single()
  return data?.id ?? 'pro'
}

