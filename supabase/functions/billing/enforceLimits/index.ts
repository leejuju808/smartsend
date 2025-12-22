/**
 * Block 17300 — SmartSend Billing Guard v2
 * 
 * Nightly worker to enforce plan limits and check trial expiration
 * Runs daily at midnight to:
 * - Check trial expiration and lock features
 * - Enforce plan limits
 * - Update billing status
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Get all active subscriptions
    const { data: subscriptions, error: subsError } = await supabase
      .from('subscriptions')
      .select('owner_id, plan, status, trial_ends_at, is_trial_active')
      .in('status', ['active', 'trialing', 'past_due']);

    if (subsError) {
      throw subsError;
    }

    const results = {
      trialsChecked: 0,
      trialsExpired: 0,
      limitsEnforced: 0,
      errors: [] as string[],
    };

    for (const subscription of subscriptions || []) {
      try {
        // Check trial expiration
        if (subscription.is_trial_active && subscription.trial_ends_at) {
          const { data: trialCheck } = await supabase
            .rpc('check_trial_expiration', { p_owner_id: subscription.owner_id })
            .single();

          results.trialsChecked++;

          if (trialCheck?.is_expired && trialCheck?.should_lock) {
            // Lock features
            await supabase.rpc('lock_features_on_trial_expired', {
              p_owner_id: subscription.owner_id,
            });
            results.trialsExpired++;
          }
        }

        // Check plan limits
        const { data: limitCheck } = await supabase
          .rpc('check_plan_limits_v2', {
            p_owner_id: subscription.owner_id,
            p_action: 'send_email',
            p_count: 0,
          })
          .single();

        if (limitCheck && !limitCheck.allowed) {
          // Log limit reached event
          await supabase
            .from('billing_events')
            .insert({
              owner_id: subscription.owner_id,
              event_type: 'limit_reached',
              event_data: {
                limit_type: 'emails',
                checked_at: new Date().toISOString(),
              },
            });
          results.limitsEnforced++;
        }

        // Update last limit check time
        await supabase
          .from('subscriptions')
          .update({
            last_limit_check_at: new Date().toISOString(),
          })
          .eq('owner_id', subscription.owner_id);
      } catch (error: any) {
        results.errors.push(`Error processing subscription ${subscription.owner_id}: ${error.message}`);
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





















































