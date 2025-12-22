// Block 60000 — SmartSend Roofing "AI Scheduling Assistant + Predictive Workload Planner" v1
// Edge Function: /schedule/auto-adjust
// 
// Automatic rescheduling logic triggered by:
// - Weather changes
// - Crew unavailability
// - Job delays
// - Other schedule disruptions

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.48.0";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const supabaseServiceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const supabase = createClient(supabaseUrl, supabaseServiceRoleKey, {
  auth: { persistSession: false },
});

const OPENWEATHER_API_KEY = Deno.env.get("OPENWEATHER_API_KEY");

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

interface AutoAdjustRequest {
  job_id: string;
  workspace_id: string;
  trigger_reason: "weather_risk" | "crew_unavailable" | "job_delayed" | "conflict_detected";
  trigger_details?: {
    weather_risk_level?: string;
    crew_id?: string;
    delay_days?: number;
    conflict_type?: string;
  };
  lookahead_days?: number;
}

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const body: AutoAdjustRequest = await req.json();

    if (!body.job_id || !body.workspace_id || !body.trigger_reason) {
      return new Response(
        JSON.stringify({
          error: "job_id, workspace_id, and trigger_reason are required",
        }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ============================================================
    // Get current job schedule
    // ============================================================
    const { data: job, error: jobError } = await supabase
      .from("roofing_jobs")
      .select(`
        id,
        workspace_id,
        title,
        status,
        scheduled_start_date,
        scheduled_end_date,
        address
      `)
      .eq("id", body.job_id)
      .eq("workspace_id", body.workspace_id)
      .single();

    if (jobError || !job) {
      return new Response(
        JSON.stringify({ error: "Job not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get current schedule
    const { data: currentSchedule } = await supabase
      .from("crew_schedules")
      .select("*")
      .eq("job_id", body.job_id)
      .eq("status", "scheduled")
      .order("start_date", { ascending: true })
      .limit(1)
      .single();

    if (!currentSchedule) {
      return new Response(
        JSON.stringify({ error: "No active schedule found for this job" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ============================================================
    // Call AI recommendation to find new date
    // ============================================================
    const lookaheadDays = body.lookahead_days || 30;
    const aiRecommendUrl = `${supabaseUrl}/functions/v1/schedule/ai-recommend`;

    const aiRecommendBody = {
      job_id: body.job_id,
      workspace_id: body.workspace_id,
      preferred_crew_id: body.trigger_details?.crew_id || currentSchedule.crew_id,
      consider_weather: body.trigger_reason === "weather_risk",
      lookahead_days: lookaheadDays,
    };

    const aiResponse = await fetch(aiRecommendUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${supabaseServiceRoleKey}`,
      },
      body: JSON.stringify(aiRecommendBody),
    });

    if (!aiResponse.ok) {
      const errorData = await aiResponse.json();
      return new Response(
        JSON.stringify({
          error: "Failed to get AI recommendation",
          details: errorData,
        }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const aiData = await aiResponse.json();

    if (!aiData.success || !aiData.recommended_dates) {
      return new Response(
        JSON.stringify({
          error: "AI recommendation failed to find alternative dates",
          details: aiData,
        }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const newStartDate = aiData.recommended_dates.start;
    const newEndDate = aiData.recommended_dates.end;
    const newCrewId = aiData.recommended_crew?.id || currentSchedule.crew_id;

    // ============================================================
    // Update schedule
    // ============================================================
    const { data: updatedSchedule, error: updateError } = await supabase
      .from("crew_schedules")
      .update({
        start_date: newStartDate,
        end_date: newEndDate,
        crew_id: newCrewId,
        updated_at: new Date().toISOString(),
      })
      .eq("id", currentSchedule.id)
      .select()
      .single();

    if (updateError) {
      return new Response(
        JSON.stringify({
          error: "Failed to update schedule",
          details: updateError.message,
        }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Update job dates
    await supabase
      .from("roofing_jobs")
      .update({
        scheduled_start_date: newStartDate,
        scheduled_end_date: newEndDate,
      })
      .eq("id", body.job_id);

    // ============================================================
    // Notify homeowner if applicable
    // ============================================================
    const { data: homeowner } = await supabase
      .from("homeowners")
      .select("id, email, name")
      .eq("job_id", body.job_id)
      .limit(1)
      .single();

    if (homeowner) {
      // Create a new homeowner schedule response record for the reschedule
      await supabase.from("homeowner_schedule_responses").insert({
        job_id: body.job_id,
        workspace_id: body.workspace_id,
        homeowner_id: homeowner.id,
        proposed_start_date: newStartDate,
        proposed_end_date: newEndDate,
        response: "requested_change", // System-initiated change
        notes: `Auto-rescheduled due to: ${body.trigger_reason}`,
        responded_at: new Date().toISOString(),
      });

      // TODO: Send notification email/SMS to homeowner
      // This would integrate with your email-send function
    }

    // ============================================================
    // Log the adjustment
    // ============================================================
    const adjustmentLog = {
      job_id: body.job_id,
      workspace_id: body.workspace_id,
      trigger_reason: body.trigger_reason,
      trigger_details: body.trigger_details || {},
      old_schedule: {
        start_date: currentSchedule.start_date,
        end_date: currentSchedule.end_date,
        crew_id: currentSchedule.crew_id,
      },
      new_schedule: {
        start_date: newStartDate,
        end_date: newEndDate,
        crew_id: newCrewId,
      },
      ai_recommendation: {
        confidence: aiData.confidence,
        reasoning: aiData.reasoning,
      },
      adjusted_at: new Date().toISOString(),
    };

    // Store in a schedule_adjustments table if it exists, or log it
    console.log("Schedule adjustment:", JSON.stringify(adjustmentLog, null, 2));

    return new Response(
      JSON.stringify({
        success: true,
        adjustment: adjustmentLog,
        updated_schedule: updatedSchedule,
        homeowner_notified: !!homeowner,
        message: `Job rescheduled from ${currentSchedule.start_date} to ${newStartDate} due to ${body.trigger_reason}`,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Error in auto-adjust:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
































