// Block 34888 — SmartSend Roofing AI Lead Scrubber + Qualification Engine v1
// Edge Function: /lead-routing
// 
// This function routes leads based on quality scores to appropriate actions:
// - 80-100: Hot leads → immediate appointment
// - 60-79: Warm leads → strong follow-up sequence
// - 40-59: Medium leads → nurture pipeline
// - 0-39: Low quality → mark as low quality

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
    const { lead_id } = await req.json().catch(() => ({}));

    if (!lead_id) {
      return new Response(
        JSON.stringify({ error: "Missing lead_id" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Fetch quality data
    const { data: quality, error: qualityError } = await supabase
      .from("lead_quality")
      .select("quality_score, lead_type, urgency, intent")
      .eq("lead_id", lead_id)
      .single();

    if (qualityError || !quality) {
      return new Response(
        JSON.stringify({ error: "Quality data not found. Run lead-scrub first." }),
        {
          status: 404,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const score = quality.quality_score || 0;
    const leadType = quality.lead_type;
    let action: string;
    let actionResult: any;

    // Route based on score
    if (score >= 80) {
      // Hot lead → immediate appointment request
      action = "fast_track_estimate";
      try {
        const { error } = await supabase.rpc("schedule_fast_track_estimate", {
          p_lead_id: lead_id,
        });
        if (error) throw error;
        actionResult = { status: "scheduled" };
      } catch (error: any) {
        console.error("Fast track error:", error);
        actionResult = { error: error.message };
      }
    } else if (score >= 60) {
      // Warm lead → strong follow-up sequence
      action = "strong_followup";
      try {
        const { error } = await supabase.rpc("start_strong_followup", {
          p_lead_id: lead_id,
        });
        if (error) throw error;
        actionResult = { status: "enrolled" };
      } catch (error: any) {
        console.error("Strong followup error:", error);
        actionResult = { error: error.message };
      }
    } else if (score >= 40) {
      // Medium lead → nurture pipeline
      action = "nurture";
      try {
        const { error } = await supabase.rpc("nurture_sequence", {
          p_lead_id: lead_id,
        });
        if (error) throw error;
        actionResult = { status: "enrolled" };
      } catch (error: any) {
        console.error("Nurture error:", error);
        actionResult = { error: error.message };
      }
    } else {
      // Low quality → mark as low quality
      action = "mark_low_quality";
      try {
        const { error } = await supabase.rpc("mark_low_quality", {
          p_lead_id: lead_id,
        });
        if (error) throw error;
        actionResult = { status: "marked" };
      } catch (error: any) {
        console.error("Mark low quality error:", error);
        actionResult = { error: error.message };
      }
    }

    return new Response(
      JSON.stringify({
        ok: true,
        lead_id,
        score,
        lead_type: leadType,
        action,
        result: actionResult,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error: any) {
    console.error("Lead routing error:", error);
    return new Response(
      JSON.stringify({ error: error.message || "Internal server error" }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
































