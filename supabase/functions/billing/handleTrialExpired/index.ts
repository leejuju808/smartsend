/**
 * Block 17300 — SmartSend Billing Guard v2
 * 
 * Worker to handle trial expiration
 * Called when trial expires to lock features
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

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
    const supabase = createClient(supabaseUrl, supabaseKey);

    const { ownerId } = await req.json();

    if (!ownerId) {
      return new Response(
        JSON.stringify({ error: 'ownerId required' }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 400,
        }
      );
    }

    // Check trial expiration
    const { data: trialCheck } = await supabase
      .rpc('check_trial_expiration', { p_owner_id: ownerId })
      .single();

    if (!trialCheck?.is_expired) {
      return new Response(
        JSON.stringify({ message: 'Trial not expired', trialCheck }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 200,
        }
      );
    }

    // Lock features
    await supabase.rpc('lock_features_on_trial_expired', {
      p_owner_id: ownerId,
    });

    return new Response(
      JSON.stringify({
        success: true,
        message: 'Trial expired and features locked',
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





















































