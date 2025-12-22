/**
 * Block 13800 — Lead Score Engine v1
 * Nightly worker to recalculate lead scores
 * 
 * Usage:
 * - Call via cron: supabase functions invoke recalculate-lead-scores
 * - Or manually: POST /recalculate-lead-scores with { workspace_id, limit }
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });

    const { workspace_id, limit = 100 } = await req.json();

    if (!workspace_id) {
      return new Response(
        JSON.stringify({ error: "workspace_id required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Call the database function to recalculate scores
    const { data, error } = await supabase.rpc("recalculate_workspace_lead_scores", {
      p_workspace_id: workspace_id,
      p_limit: limit,
    });

    if (error) {
      console.error("Error recalculating scores:", error);
      return new Response(
        JSON.stringify({ error: error.message }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const processed = data?.length || 0;

    return new Response(
      JSON.stringify({
        ok: true,
        workspace_id,
        processed,
        limit,
        results: data || [],
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: any) {
    console.error("Error in recalculate-lead-scores:", error);
    return new Response(
      JSON.stringify({ error: error.message || "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});





















































