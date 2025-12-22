// Block 21998 — SmartSend Roofing Job Momentum Score v1
// Edge Function: Update Job Momentum Score
// Processes signals from communication timing, tone, intent, proposals, and activity to update momentum score
//
// This function is called when:
// - New message from homeowner or estimator
// - Tone/intent classified
// - Proposal events (requested, sent, viewed)
// - Missed follow-ups
// - Risk changes
// - Experience score changes
// - Pipeline stage changes
// - Response time detected

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  { auth: { persistSession: false } }
);

interface MomentumSignal {
  type: string;
  value: number;
  description?: string;
}

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, Authorization",
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
    const { lead_id, signals } = await req.json();

    if (!lead_id) {
      return new Response(
        JSON.stringify({ error: "Missing required field: lead_id" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    if (!signals || !Array.isArray(signals)) {
      return new Response(
        JSON.stringify({ error: "Missing or invalid signals array" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    // Fetch current lead state
    const { data: lead, error: leadError } = await supabase
      .from("leads")
      .select("id, momentum_score, momentum_trend")
      .eq("id", lead_id)
      .single();

    if (leadError || !lead) {
      console.error("Error fetching lead:", leadError);
      return new Response(
        JSON.stringify({ error: "Lead not found" }),
        { status: 404, headers: { "Content-Type": "application/json" } }
      );
    }

    // Start with current score (default to 50 if null)
    let score = lead.momentum_score ?? 50;
    const oldScore = score;

    // Apply incoming signals
    const appliedSignals: MomentumSignal[] = [];
    for (const signal of signals) {
      if (signal.value && typeof signal.value === "number") {
        score += signal.value;
        appliedSignals.push({
          type: signal.type || "unknown",
          value: signal.value,
          description: signal.description,
        });
      }
    }

    // Clamp score between 0 and 100
    if (score < 0) score = 0;
    if (score > 100) score = 100;

    // Determine trend
    const trend =
      score > oldScore ? "positive" :
      score < oldScore ? "negative" :
      "neutral";

    // Update lead with new score and trend
    const { error: updateError } = await supabase
      .from("leads")
      .update({
        momentum_score: score,
        momentum_trend: trend,
        last_momentum_update: new Date().toISOString(),
      })
      .eq("id", lead_id);

    if (updateError) {
      console.error("Error updating lead momentum score:", updateError);
      return new Response(
        JSON.stringify({ error: updateError.message }),
        { status: 500, headers: { "Content-Type": "application/json" } }
      );
    }

    // Log to audit trail
    try {
      await supabase.from("lead_audit_logs").insert({
        lead_id,
        event_type: "momentum_update",
        actor_type: "system",
        event_data: {
          old_score: oldScore,
          new_score: score,
          trend,
          signals: appliedSignals,
          score_delta: score - oldScore,
        },
      });
    } catch (auditError) {
      // Don't fail if audit log fails, but log it
      console.error("Error logging to audit trail:", auditError);
    }

    return new Response(
      JSON.stringify({
        ok: true,
        lead_id,
        old_score: oldScore,
        new_score: score,
        trend,
        signals_applied: appliedSignals.length,
      }),
      { 
        status: 200, 
        headers: { 
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
        } 
      }
    );
  } catch (error: any) {
    console.error("Error in update-job-momentum:", error);
    return new Response(
      JSON.stringify({ error: error.message || "Internal server error" }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
});









































