// Block 57000 — SmartSend Roofing "Sales Proposal Builder + Digital Signing System" v1
// Edge Function: /proposal/view
// Updates viewed_at and proposal_view_logs

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.48.0";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const supabaseServiceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const supabase = createClient(supabaseUrl, supabaseServiceRoleKey, {
  auth: { persistSession: false },
});

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const {
      proposal_id,
      device,
      ip_address,
      user_agent,
      scroll_depth_percent,
      time_spent_seconds,
      sections_viewed = [],
    } = await req.json();

    if (!proposal_id) {
      return new Response(
        JSON.stringify({ error: "proposal_id is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Track view using database function
    const { data: logId, error: trackError } = await supabase.rpc(
      "track_proposal_view",
      {
        p_proposal_id: proposal_id,
        p_device: device || null,
        p_ip_address: ip_address || null,
        p_user_agent: user_agent || null,
      }
    );

    if (trackError) {
      console.error("Error tracking view:", trackError);
    }

    // Update view log with additional metrics if provided
    if (logId && (scroll_depth_percent !== undefined || time_spent_seconds !== undefined || sections_viewed.length > 0)) {
      await supabase
        .from("proposal_view_logs")
        .update({
          scroll_depth_percent: scroll_depth_percent || null,
          time_spent_seconds: time_spent_seconds || null,
          sections_viewed: sections_viewed.length > 0 ? sections_viewed : null,
        })
        .eq("id", logId);
    }

    // Get updated proposal
    const { data: proposal, error: proposalError } = await supabase
      .from("proposals")
      .select("*")
      .eq("id", proposal_id)
      .single();

    if (proposalError) {
      console.error("Error fetching proposal:", proposalError);
    }

    return new Response(
      JSON.stringify({ 
        proposal,
        view_logged: true,
        log_id: logId,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Error in proposal-view:", error);
    return new Response(
      JSON.stringify({ error: "Internal server error", details: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
































