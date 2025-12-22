// Block 22073 — SmartSend Roofing Job Save Engine v1
// Edge Function: Trigger Job Save Event
// Called by ANY brain detecting danger signals
//
// This is the "CPR system" for dying roofing jobs.
// Automatically detects at-risk jobs and triggers recovery actions.
//
// Input: { lead_id, workspace_id, danger_type, lead_snapshot }
//
// When triggered:
// 1. Creates a Job Save Event
// 2. Generates AI recovery message
// 3. Creates Action Queue task
// 4. Logs to timeline
// 5. Job glows red in Pipeline view

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { OpenAI } from "https://deno.land/x/openai@v4.20.1/mod.ts";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  { auth: { persistSession: false } }
);

const openai = new OpenAI({
  apiKey: Deno.env.get("OPENAI_API_KEY")!,
});

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
    const { lead_id, workspace_id, danger_type, lead_snapshot } = await req.json();

    if (!lead_id || !workspace_id || !danger_type) {
      return new Response(
        JSON.stringify({ error: "Missing required fields: lead_id, workspace_id, danger_type" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    // Determine severity based on danger type
    let severity: "low" | "medium" | "high" | "critical" = "low";
    
    if (
      danger_type === "critical_health" ||
      danger_type === "ghosting" ||
      danger_type === "risk_critical" ||
      danger_type === "health_drop" && lead_snapshot?.job_health_score < 30
    ) {
      severity = "critical";
    } else if (
      danger_type.includes("delay") ||
      danger_type.includes("momentum") ||
      danger_type === "risk_spike" ||
      danger_type === "negative_tone" ||
      danger_type === "health_drop"
    ) {
      severity = "high";
    } else if (
      danger_type === "experience_drop" ||
      danger_type === "probability_drop" ||
      danger_type === "stuck_in_stage"
    ) {
      severity = "medium";
    }

    // Map danger_type to event_type
    const eventTypeMap: Record<string, string> = {
      critical_health: "health_drop",
      health_drop: "health_drop",
      momentum_drop: "momentum_drop",
      ghosting: "ghosting",
      risk_critical: "risk_spike",
      risk_spike: "risk_spike",
      proposal_delay: "proposal_delay",
      missed_followup: "missed_followup",
      negative_tone: "negative_tone",
      experience_drop: "experience_drop",
      probability_drop: "probability_drop",
      stuck_in_stage: "stuck_in_stage",
      no_reply_48h: "no_reply_48h",
      frustration_detected: "frustration_detected",
    };

    const event_type = eventTypeMap[danger_type] || danger_type;

    // STEP 1: Fetch full lead data if snapshot not provided
    let leadData = lead_snapshot;
    if (!leadData) {
      const { data: lead, error: leadError } = await supabase
        .from("leads")
        .select("*")
        .eq("id", lead_id)
        .single();

      if (leadError || !lead) {
        return new Response(
          JSON.stringify({ error: "Lead not found" }),
          { status: 404, headers: { "Content-Type": "application/json" } }
        );
      }

      leadData = lead;
    }

    // STEP 2: Generate AI recovery message suggestion
    let recoveryMessage = "";
    try {
      const prompt = `You are SmartSend AI. A roofing job is in danger and needs immediate attention.

Here is the lead snapshot:
${JSON.stringify(leadData, null, 2)}

Danger Type: ${danger_type}
Severity: ${severity}

Write a short, friendly recovery message the estimator can send to re-engage the homeowner.
Tone: helpful, confident, no pressure. Keep it under 100 words.
Be specific about what you're checking in on, but don't sound desperate.

Format as plain text (no markdown).`;

      const completion = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [{ role: "user", content: prompt }],
        max_tokens: 200,
        temperature: 0.7,
      });

      recoveryMessage = completion.choices[0]?.message?.content?.trim() || "";
    } catch (aiError) {
      console.error("Error generating AI recovery message:", aiError);
      // Fallback message
      recoveryMessage = `Hi ${leadData.first_name || "there"} — just wanted to check in on your roofing project. I know roofing projects can feel overwhelming, and I'm here to make this simple. I've got everything ready on my end. Do you still want help getting this taken care of? I can get your project back on track today.`;
    }

    // STEP 3: Log Job Save Event
    const { data: saveEvent, error: eventError } = await supabase
      .from("job_save_events")
      .insert({
        lead_id,
        workspace_id,
        event_type,
        severity,
        reason: `Triggered by ${danger_type}`,
        lead_snapshot: leadData,
        recovery_message_draft: recoveryMessage,
        status: "active",
      })
      .select("*")
      .single();

    if (eventError) {
      console.error("Error creating job save event:", eventError);
      return new Response(
        JSON.stringify({ error: "Failed to create job save event", details: eventError.message }),
        { status: 500, headers: { "Content-Type": "application/json" } }
      );
    }

    // STEP 4: Create Action Queue task
    // Priority: 1-10 for critical, 11-30 for high, 31-50 for medium, 51-70 for low
    const priorityMap: Record<string, number> = {
      critical: 5,
      high: 15,
      medium: 35,
      low: 60,
    };
    const priority = priorityMap[severity] || 50;

    // Get assigned user (estimator or owner)
    const assignedUserId = leadData.estimator_id || leadData.owner_id || null;

    const { error: taskError } = await supabase
      .from("action_queue_tasks")
      .insert({
        workspace_id,
        lead_id,
        assigned_user_id: assignedUserId,
        task_type: "job_save",
        priority,
        status: "open",
        source: "job_save_engine",
        metadata: {
          danger_type,
          severity,
          event_id: saveEvent.id,
          recovery_message_draft: recoveryMessage,
          reason: `Job Save triggered: ${danger_type}`,
        },
      });

    if (taskError) {
      console.error("Error creating action queue task:", taskError);
      // Don't fail the whole request if task creation fails
    }

    // STEP 5: Add to timeline
    const { error: timelineError } = await supabase
      .from("job_timelines")
      .insert({
        lead_id,
        event_type: "job_save_triggered",
        event_category: "risk",
        event_summary: `Job Save triggered (${danger_type}) - ${severity} severity`,
        event_data: {
          severity,
          danger_type,
          event_id: saveEvent.id,
          recovery_message_draft: recoveryMessage,
        },
      });

    if (timelineError) {
      console.error("Error adding timeline event:", timelineError);
      // Don't fail the whole request if timeline fails
    }

    return new Response(
      JSON.stringify({
        success: true,
        event_id: saveEvent.id,
        severity,
        recovery_message: recoveryMessage,
      }),
      {
        status: 200,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
        },
      }
    );
  } catch (error) {
    console.error("Error in trigger-job-save-event:", error);
    return new Response(
      JSON.stringify({ error: "Internal server error", details: error.message }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
});









































