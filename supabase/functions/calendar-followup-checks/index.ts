// Block 20800 — Roofing Calendar Sync v1
// Edge function to check for unresponsive adjusters and missed homeowner follow-ups
// Should be called by cron job every hour

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    // Create Supabase client with service role key
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    console.log("[Calendar Follow-Up Checks] Starting checks...");

    // 1. Check for unresponsive adjusters (48+ hours)
    console.log("[Calendar Follow-Up Checks] Checking for unresponsive adjusters...");
    const { data: adjusterResult, error: adjusterError } = await supabase.rpc(
      "check_and_create_adjuster_followup_events"
    );

    if (adjusterError) {
      console.error("[Calendar Follow-Up Checks] Error checking adjusters:", adjusterError);
    } else {
      console.log("[Calendar Follow-Up Checks] Adjuster check completed");
    }

    // 2. Check for missed homeowner follow-ups (>12 hours)
    console.log("[Calendar Follow-Up Checks] Checking for missed homeowner follow-ups...");
    const { data: homeownerResult, error: homeownerError } = await supabase.rpc(
      "check_and_create_homeowner_followup_events"
    );

    if (homeownerError) {
      console.error("[Calendar Follow-Up Checks] Error checking homeowners:", homeownerError);
    } else {
      console.log("[Calendar Follow-Up Checks] Homeowner check completed");
    }

    // 3. Check for past install dates and update stages
    console.log("[Calendar Follow-Up Checks] Checking for past install dates...");
    const { data: stageResult, error: stageError } = await supabase.rpc(
      "check_and_update_stages_for_past_events"
    );

    if (stageError) {
      console.error("[Calendar Follow-Up Checks] Error updating stages:", stageError);
    } else {
      console.log("[Calendar Follow-Up Checks] Stage update check completed");
    }

    return new Response(
      JSON.stringify({
        success: true,
        message: "Calendar follow-up checks completed",
        timestamp: new Date().toISOString(),
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      }
    );
  } catch (error) {
    console.error("[Calendar Follow-Up Checks] Unexpected error:", error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error.message,
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 500,
      }
    );
  }
});
















































