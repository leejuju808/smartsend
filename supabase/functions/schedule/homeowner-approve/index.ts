// Block 60000 — SmartSend Roofing "AI Scheduling Assistant + Predictive Workload Planner" v1
// Edge Function: /schedule/homeowner-approve
// 
// Captures homeowner acceptance or rejection of proposed schedule dates

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

interface HomeownerApproveRequest {
  job_id: string;
  workspace_id: string;
  homeowner_id?: string;
  response: "accepted" | "rejected" | "requested_change";
  notes?: string;
  alternate_preferences?: {
    preferred_dates?: string[];
    unavailable_dates?: string[];
    notes?: string;
  };
  proposed_start_date: string; // YYYY-MM-DD
  proposed_end_date?: string; // YYYY-MM-DD
}

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const body: HomeownerApproveRequest = await req.json();

    if (!body.job_id || !body.workspace_id || !body.response || !body.proposed_start_date) {
      return new Response(
        JSON.stringify({
          error: "job_id, workspace_id, response, and proposed_start_date are required",
        }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Validate response value
    if (!["accepted", "rejected", "requested_change"].includes(body.response)) {
      return new Response(
        JSON.stringify({ error: "response must be 'accepted', 'rejected', or 'requested_change'" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ============================================================
    // Get job and homeowner info
    // ============================================================
    const { data: job, error: jobError } = await supabase
      .from("roofing_jobs")
      .select("id, workspace_id, title, status")
      .eq("id", body.job_id)
      .eq("workspace_id", body.workspace_id)
      .single();

    if (jobError || !job) {
      return new Response(
        JSON.stringify({ error: "Job not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get homeowner if not provided
    let homeownerId = body.homeowner_id;
    if (!homeownerId) {
      const { data: homeowner } = await supabase
        .from("homeowners")
        .select("id")
        .eq("job_id", body.job_id)
        .limit(1)
        .single();

      homeownerId = homeowner?.id;
    }

    // ============================================================
    // Save homeowner response
    // ============================================================
    const responseData = {
      job_id: body.job_id,
      workspace_id: body.workspace_id,
      homeowner_id: homeownerId || null,
      proposed_start_date: body.proposed_start_date,
      proposed_end_date: body.proposed_end_date || null,
      response: body.response,
      notes: body.notes || null,
      alternate_preferences: body.alternate_preferences || {},
      responded_at: new Date().toISOString(),
      notification_sent_at: new Date().toISOString(),
    };

    const { data: savedResponse, error: saveError } = await supabase
      .from("homeowner_schedule_responses")
      .insert(responseData)
      .select()
      .single();

    if (saveError) {
      return new Response(
        JSON.stringify({ error: "Failed to save response", details: saveError.message }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ============================================================
    // If accepted, update job schedule
    // ============================================================
    if (body.response === "accepted") {
      // Get the latest AI recommendation for this job
      const { data: recommendation } = await supabase
        .from("ai_scheduling_recommendations")
        .select("*")
        .eq("job_id", body.job_id)
        .eq("status", "pending")
        .order("created_at", { ascending: false })
        .limit(1)
        .single();

      if (recommendation) {
        // Update recommendation status
        await supabase
          .from("ai_scheduling_recommendations")
          .update({
            status: "accepted",
            accepted_at: new Date().toISOString(),
          })
          .eq("id", recommendation.id);

        // Create or update crew schedule
        if (recommendation.recommended_crew) {
          const { data: existingSchedule } = await supabase
            .from("crew_schedules")
            .select("id")
            .eq("job_id", body.job_id)
            .eq("status", "scheduled")
            .single();

          const scheduleData = {
            workspace_id: body.workspace_id,
            job_id: body.job_id,
            crew_id: recommendation.recommended_crew,
            start_date: body.proposed_start_date,
            end_date: body.proposed_end_date || recommendation.recommended_end,
            estimated_duration: recommendation.estimated_duration_hours || null,
            status: "scheduled",
          };

          if (existingSchedule) {
            await supabase
              .from("crew_schedules")
              .update(scheduleData)
              .eq("id", existingSchedule.id);
          } else {
            await supabase.from("crew_schedules").insert(scheduleData);
          }

          // Update job status
          await supabase
            .from("roofing_jobs")
            .update({
              status: "scheduled",
              scheduled_start_date: body.proposed_start_date,
              scheduled_end_date: body.proposed_end_date || recommendation.recommended_end,
            })
            .eq("id", body.job_id);
        }
      }
    }

    // ============================================================
    // If requested_change, trigger AI re-recommendation
    // ============================================================
    if (body.response === "requested_change" && body.alternate_preferences) {
      // This could trigger an automatic re-run of the AI recommendation
      // For now, we'll just log it - the UI can call ai-recommend again with preferences
      console.log("Homeowner requested change, preferences:", body.alternate_preferences);
    }

    return new Response(
      JSON.stringify({
        success: true,
        response: savedResponse,
        action_taken: body.response === "accepted" ? "schedule_updated" : "response_recorded",
        next_steps:
          body.response === "accepted"
            ? "Job schedule has been confirmed and updated"
            : body.response === "requested_change"
            ? "Consider running AI recommendation again with homeowner preferences"
            : "Job schedule remains pending",
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Error processing homeowner approval:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
































