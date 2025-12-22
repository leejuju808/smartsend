// supabase/functions/reset-plan-usage/index.ts
// Edge Function: reset-plan-usage
// Runs daily to check for period reset and resets usage

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

serve(async () => {
  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const now = new Date().toISOString();

    // Find workspaces whose period has ended
    const { data: workspaces, error } = await supabase
      .from("workspaces")
      .select("id, plan_period_start, plan_period_end, plan_emails_sent_this_period")
      .not("plan_period_end", "is", null)
      .lte("plan_period_end", now);

    if (error) {
      console.error("Error fetching workspaces:", error);
      return new Response(
        JSON.stringify({ error: error.message }),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 500,
        }
      );
    }

    if (!workspaces || workspaces.length === 0) {
      return new Response(
        JSON.stringify({ message: "no workspaces to reset", reset: 0 }),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 200,
        }
      );
    }

    let resetCount = 0;

    for (const ws of workspaces) {
      // Reset usage; period dates will be set by Stripe webhook
      const { error: updateError } = await supabase
        .from("workspaces")
        .update({
          plan_emails_sent_this_period: 0,
          plan_period_start: now,
          plan_period_end: null, // set next period end via Stripe webhook
        })
        .eq("id", ws.id);

      if (updateError) {
        console.error(`Failed to reset workspace ${ws.id}:`, updateError);
      } else {
        resetCount++;
      }
    }

    return new Response(
      JSON.stringify({
        ok: true,
        reset: resetCount,
        total: workspaces.length,
        timestamp: now,
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      }
    );
  } catch (e: any) {
    console.error("Error in reset-plan-usage:", e);
    return new Response(
      JSON.stringify({ error: e.message || "Unknown error" }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 500,
      }
    );
  }
});



























































