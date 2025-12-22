/**
 * Block 17300 — SmartSend Billing Guard v2
 * 
 * Nightly worker to sync all subscriptions from Stripe
 * Ensures database stays in sync with Stripe
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import Stripe from 'https://esm.sh/stripe@14.21.0?target=deno';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const stripeKey = Deno.env.get('STRIPE_SECRET_KEY')!;

    const supabase = createClient(supabaseUrl, supabaseKey);
    const stripe = new Stripe(stripeKey, {
      apiVersion: '2024-11-20.acacia',
      httpClient: Stripe.createFetchHttpClient(),
    });

    // Get all subscriptions with Stripe IDs
    const { data: subscriptions, error: subsError } = await supabase
      .from('subscriptions')
      .select('owner_id, stripe_subscription_id')
      .not('stripe_subscription_id', 'is', null);

    if (subsError) {
      throw subsError;
    }

    const results = {
      synced: 0,
      errors: [] as string[],
    };

    for (const subscription of subscriptions || []) {
      try {
        if (!subscription.stripe_subscription_id) {
          continue;
        }

        // Fetch from Stripe
        const stripeSub = await stripe.subscriptions.retrieve(
          subscription.stripe_subscription_id,
          {
            expand: ['customer', 'items.data.price.product'],
          }
        );

        // Determine plan from price ID
        const priceId = stripeSub.items.data[0]?.price.id;
        const plan = mapPriceIdToPlan(priceId);

        // Update subscription
        const { error: updateError } = await supabase
          .from('subscriptions')
          .update({
            plan,
            status: stripeSub.status as any,
            billing_status: stripeSub.status === 'active' || stripeSub.status === 'trialing'
              ? 'active'
              : stripeSub.status === 'past_due'
                ? 'past_due'
                : 'locked',
            current_period_start: new Date(stripeSub.current_period_start * 1000).toISOString(),
            current_period_end: new Date(stripeSub.current_period_end * 1000).toISOString(),
            last_stripe_sync_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          })
          .eq('owner_id', subscription.owner_id);

        if (updateError) {
          throw updateError;
        }

        results.synced++;
      } catch (error: any) {
        results.errors.push(`Error syncing ${subscription.owner_id}: ${error.message}`);
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        results,
        timestamp: new Date().toISOString(),
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      }
    );
  } catch (error: any) {
    return new Response(
      JSON.stringify({
        error: error.message,
        timestamp: new Date().toISOString(),
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500,
      }
    );
  }
});

function mapPriceIdToPlan(priceId?: string): 'starter' | 'growth' | 'domination' {
  if (!priceId) {
    return 'starter';
  }

  // This should match your Stripe price IDs
  // You may need to store these in environment variables or a config table
  const starterPriceId = Deno.env.get('STRIPE_PRICE_STARTER_ID');
  const growthPriceId = Deno.env.get('STRIPE_PRICE_GROWTH_ID');
  const dominationPriceId = Deno.env.get('STRIPE_PRICE_DOMINATION_ID');

  if (priceId === starterPriceId) return 'starter';
  if (priceId === growthPriceId) return 'growth';
  if (priceId === dominationPriceId) return 'domination';

  return 'starter'; // Default fallback
}





















































