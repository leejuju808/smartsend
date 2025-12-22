import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

Deno.serve(async (req) => {
  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { lead_id, signal_type } = await req.json();

    if (!lead_id || !signal_type) {
      return new Response(
        JSON.stringify({ error: "Missing lead_id or signal_type" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    // Score Weights
    const weights: Record<string, number> = {
      open: 3,
      open_multi: 5,
      click: 10,
      reply: 15,
      reply_interest: 30,
      booking: 40,
    };

    // Get current lead state
    const { data: lead, error: fetchError } = await supabase
      .from("leads")
      .select("conversion_score, pipeline_stage, last_signal")
      .eq("id", lead_id)
      .single();

    if (fetchError || !lead) {
      return new Response(
        JSON.stringify({ error: "Lead not found" }),
        { status: 404, headers: { "Content-Type": "application/json" } }
      );
    }

    // Calculate new score
    const scoreIncrement = weights[signal_type] || 0;
    const oldScore = lead.conversion_score ?? 0;
    const oldStage = lead.pipeline_stage ?? "new";
    let newScore = oldScore + scoreIncrement;

    // Apply manual score adjustments from lead_notes
    const { data: notesAgg, error: notesError } = await supabase
      .from("lead_notes")
      .select("score_delta")
      .eq("lead_id", lead_id);

    let manualDelta = 0;
    if (!notesError && notesAgg) {
      manualDelta = notesAgg
        .map((n: any) => n.score_delta || 0)
        .reduce((sum: number, x: number) => sum + x, 0);
    }

    // Apply manual adjustment
    newScore += manualDelta;

    // Clamp score between 0 and 100
    if (newScore < 0) newScore = 0;
    if (newScore > 100) newScore = 100;

    // Auto-pipeline mapping
    let pipeline_stage = "new";
    if (newScore >= 5 && newScore <= 14) {
      pipeline_stage = "engaged";
    } else if (newScore >= 15 && newScore <= 29) {
      pipeline_stage = "interested";
    } else if (newScore >= 30 && newScore <= 49) {
      pipeline_stage = "qualified";
    } else if (newScore >= 50) {
      pipeline_stage = "meeting_booked";
    }

    // Update lead with new score and pipeline stage
    const { error: updateError } = await supabase
      .from("leads")
      .update({
        conversion_score: newScore,
        pipeline_stage,
        last_signal: {
          type: signal_type,
          at: new Date().toISOString(),
        },
      })
      .eq("id", lead_id);

    if (updateError) {
      console.error("[intent-score-update] Update failed:", updateError);
      return new Response(
        JSON.stringify({ error: updateError.message }),
        { status: 500, headers: { "Content-Type": "application/json" } }
      );
    }

    // Log activity events
    const eventsToInsert: any[] = [];

    // 1) Generic intent/score event
    eventsToInsert.push({
      lead_id,
      event_type: "intent_scored",
      source: "system",
      related_table: null,
      related_id: null,
      payload: {
        signal_type,
        old_score: oldScore,
        new_score: newScore,
        old_pipeline_stage: oldStage,
        new_pipeline_stage: pipeline_stage,
        last_signal: { type: signal_type, at: new Date().toISOString() },
      },
    });

    // 2) Separate event if pipeline changed
    if (oldStage !== pipeline_stage) {
      eventsToInsert.push({
        lead_id,
        event_type: "pipeline_changed",
        source: "system",
        related_table: "leads",
        related_id: lead_id,
        payload: {
          from: oldStage,
          to: pipeline_stage,
          reason: `intent-score-update:${signal_type}`,
        },
      });
    }

    if (eventsToInsert.length > 0) {
      const { error: activityError } = await supabase
        .from("lead_activity_events")
        .insert(eventsToInsert);

      if (activityError) {
        console.error("Failed to insert lead_activity_events", activityError);
      }
    }

    return new Response(
      JSON.stringify({
        score: newScore,
        pipeline_stage,
        signal_type,
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[intent-score-update] Error:", message);
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
});

