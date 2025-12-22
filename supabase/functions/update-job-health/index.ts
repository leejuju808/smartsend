// Block 22017 — SmartSend Roofing Job Health Score v2
// Edge Function: Update Job Health Score
// Runs whenever ANY input metric changes:
// - momentum
// - experience
// - probability
// - risk
// - follow-up
// - tone
// - intent
// - pipeline events
// - proposal events
// - estimator performance update

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  { auth: { persistSession: false } }
);

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
      },
    });
  }

  // Allow POST requests only
  if (req.method !== "POST") {
    return new Response(
      JSON.stringify({ error: "Method not allowed" }),
      { status: 405, headers: { "Content-Type": "application/json" } }
    );
  }

  try {
    const { lead_id } = await req.json();

    if (!lead_id) {
      return new Response(
        JSON.stringify({ error: "Missing required field: lead_id" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    // Fetch fused view data
    const { data: lead, error: viewError } = await supabase
      .from("lead_health_view")
      .select("*")
      .eq("lead_id", lead_id)
      .single();

    if (viewError || !lead) {
      console.error("Error fetching lead health view:", viewError);
      return new Response(
        JSON.stringify({ error: "Lead not found in health view" }),
        { status: 404, headers: { "Content-Type": "application/json" } }
      );
    }

    // Risk Score Conversion Map (inverted: lower risk = higher score)
    const riskScoreMap: Record<string, number> = {
      low: 85,
      medium: 60,
      high: 35,
      critical: 10,
    };

    const riskScore = riskScoreMap[lead.risk_category] ?? 50;

    // Calculate health score using weighted formula
    const health =
      (lead.momentum_score * 0.22) +
      (lead.homeowner_experience_score * 0.18) +
      (lead.job_probability * 0.15) +
      (riskScore * 0.15) +
      (lead.estimator_performance * 0.10) +
      (lead.tone_score * 0.05) +
      (lead.intent_score * 0.05) -
      Math.min(lead.stage_penalty || 0, 10) -
      Math.min(lead.followup_penalty || 0, 10) -
      Math.min(lead.proposal_penalty || 0, 10) +
      (lead.source_adjustment || 0);

    // Clamp to 0-100 and round
    const final = Math.max(0, Math.min(100, Math.round(health)));

    // Get current score for trend calculation
    const currentScore = lead.current_job_health_score ?? 50;

    // Determine trend
    const trend =
      final > currentScore ? "improving" :
      final < currentScore ? "declining" :
      "stable";

    // Update lead with new health score
    const { error: updateError } = await supabase
      .from("leads")
      .update({
        job_health_score: final,
        job_health_trend: trend,
        last_health_update: new Date().toISOString(),
      })
      .eq("id", lead_id);

    if (updateError) {
      console.error("Error updating job health score:", updateError);
      return new Response(
        JSON.stringify({ error: updateError.message }),
        { status: 500, headers: { "Content-Type": "application/json" } }
      );
    }

    // Log to job_timelines
    try {
      await supabase.from("job_timelines").insert({
        lead_id,
        event_type: "job_health_updated",
        event_data: {
          category: "ai_intelligence",
          summary: `Job Health is now ${final} (${trend})`,
          old_score: currentScore,
          new_score: final,
          trend: trend,
          breakdown: {
            momentum: lead.momentum_score,
            experience: lead.homeowner_experience_score,
            probability: lead.job_probability,
            risk_score: riskScore,
            estimator_performance: lead.estimator_performance,
            tone_score: lead.tone_score,
            intent_score: lead.intent_score,
            stage_penalty: lead.stage_penalty,
            followup_penalty: lead.followup_penalty,
            proposal_penalty: lead.proposal_penalty,
            source_adjustment: lead.source_adjustment,
          },
        },
      });
    } catch (timelineError) {
      // Don't fail if timeline log fails, but log it
      console.error("Error logging to job_timelines:", timelineError);
    }

    return new Response(
      JSON.stringify({
        ok: true,
        lead_id,
        old_score: currentScore,
        new_score: final,
        trend,
        breakdown: {
          momentum: lead.momentum_score,
          experience: lead.homeowner_experience_score,
          probability: lead.job_probability,
          risk_score: riskScore,
          estimator_performance: lead.estimator_performance,
          tone_score: lead.tone_score,
          intent_score: lead.intent_score,
          stage_penalty: lead.stage_penalty,
          followup_penalty: lead.followup_penalty,
          proposal_penalty: lead.proposal_penalty,
          source_adjustment: lead.source_adjustment,
        },
      }),
      {
        status: 200,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
        },
      }
    );
  } catch (error: any) {
    console.error("Error in update-job-health:", error);
    return new Response(
      JSON.stringify({ error: error.message || "Internal server error" }),
      {
        status: 500,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
        },
      }
    );
  }
});

