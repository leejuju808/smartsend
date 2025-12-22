// Edge Function: Assign crew to job with automatic duration calculation
// POST /functions/v1/schedule-assign-crew

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
);

interface AssignCrewRequest {
  workspace_id: string;
  job_id: string;
  crew_id: string;
  start_date: string; // YYYY-MM-DD
  estimated_duration?: number; // hours (optional, will calculate if not provided)
  notes?: string;
}

Deno.serve(async (req) => {
  try {
    const body: AssignCrewRequest = await req.json();

    // Validate required fields
    if (!body.workspace_id || !body.job_id || !body.crew_id || !body.start_date) {
      return new Response(
        JSON.stringify({ error: "Missing required fields: workspace_id, job_id, crew_id, start_date" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    // Get job details for duration calculation
    const { data: job, error: jobError } = await supabase
      .from("roofing_jobs")
      .select("id, official_squares, roof_pitch, roof_squares, workspace_id")
      .eq("id", body.job_id)
      .single();

    if (jobError || !job) {
      return new Response(
        JSON.stringify({ error: "Job not found" }),
        { status: 404, headers: { "Content-Type": "application/json" } }
      );
    }

    // Get crew details
    const { data: crew, error: crewError } = await supabase
      .from("crews")
      .select("id, name, daily_capacity_squares")
      .eq("id", body.crew_id)
      .eq("workspace_id", body.workspace_id)
      .single();

    if (crewError || !crew) {
      return new Response(
        JSON.stringify({ error: "Crew not found" }),
        { status: 404, headers: { "Content-Type": "application/json" } }
      );
    }

    // Calculate estimated duration if not provided
    let estimated_duration = body.estimated_duration;
    if (!estimated_duration) {
      // Simple calculation: squares / crew daily capacity
      const squares = job.official_squares || job.roof_squares || 0;
      const daily_capacity = crew.daily_capacity_squares || 20; // default 20 squares/day
      
      if (squares > 0) {
        // Base hours: assume 8 hours per day
        const days_needed = Math.ceil(squares / daily_capacity);
        estimated_duration = days_needed * 8; // Convert to hours
        
        // Apply pitch multiplier if available
        if (job.roof_pitch) {
          const pitch_multiplier = 1 + (job.roof_pitch / 12) * 0.1; // Rough estimate
          estimated_duration = estimated_duration * pitch_multiplier;
        }
      } else {
        estimated_duration = 8; // Default 1 day
      }
    }

    // Calculate end date (assuming 8-hour workdays)
    const startDate = new Date(body.start_date);
    const days_needed = Math.ceil(estimated_duration / 8);
    const endDate = new Date(startDate);
    endDate.setDate(endDate.getDate() + days_needed - 1);

    // Check for conflicts
    const { data: conflicts } = await supabase
      .rpc("detect_schedule_conflicts", {
        p_workspace_id: body.workspace_id,
        p_start_date: body.start_date,
        p_end_date: endDate.toISOString().split("T")[0],
      });

    // Create or update schedule
    const { data: existingSchedule } = await supabase
      .from("crew_schedules")
      .select("id")
      .eq("job_id", body.job_id)
      .eq("status", "scheduled")
      .single();

    let scheduleData: any = {
      workspace_id: body.workspace_id,
      job_id: body.job_id,
      crew_id: body.crew_id,
      start_date: body.start_date,
      end_date: endDate.toISOString().split("T")[0],
      estimated_duration: estimated_duration,
      status: "scheduled",
      notes: body.notes || null,
    };

    let schedule;
    if (existingSchedule) {
      // Update existing schedule
      const { data, error } = await supabase
        .from("crew_schedules")
        .update(scheduleData)
        .eq("id", existingSchedule.id)
        .select()
        .single();

      if (error) throw error;
      schedule = data;
    } else {
      // Create new schedule
      const { data, error } = await supabase
        .from("crew_schedules")
        .insert(scheduleData)
        .select()
        .single();

      if (error) throw error;
      schedule = data;
    }

    // Log conflicts if any
    if (conflicts && conflicts.length > 0) {
      for (const conflict of conflicts) {
        await supabase.from("schedule_conflicts").insert({
          workspace_id: body.workspace_id,
          conflict_type: conflict.conflict_type,
          severity: conflict.severity,
          schedule_id_1: schedule.id,
          schedule_id_2: conflict.schedule_id,
          job_id_1: body.job_id,
          job_id_2: conflict.job_id,
          crew_id: body.crew_id,
          conflict_date: conflict.conflict_date,
          resolved: false,
        });
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        schedule,
        conflicts: conflicts || [],
        estimated_duration_hours: estimated_duration,
        estimated_duration_days: Math.ceil(estimated_duration / 8),
      }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Error assigning crew:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
});
































