// Block 27820 — SmartSend Roofing Labor & Crew Scheduling Automation v1
// Edge Function: Auto-assign crew and date for jobs that are ready to schedule

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  { auth: { persistSession: false } }
);

Deno.serve(async (req: Request) => {
  try {
    const { job_id } = await req.json();

    if (!job_id) {
      return new Response(
        JSON.stringify({ error: "job_id is required" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    // 1. Load job info
    const { data: job, error: jobError } = await supabase
      .from("roofing_jobs")
      .select("id, title, estimated_squares, official_squares, material_status, workspace_id")
      .eq("id", job_id)
      .single();

    if (jobError || !job) {
      return new Response(
        JSON.stringify({ error: "Job not found" }),
        { status: 404, headers: { "Content-Type": "application/json" } }
      );
    }

    // Check material status
    if (job.material_status !== "delivered") {
      return new Response(
        JSON.stringify({
          error: "materials_not_delivered",
          message: "Materials must be delivered before scheduling"
        }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    // Get squares (use estimated_squares or official_squares)
    const squares = Number(job.estimated_squares || job.official_squares || 0);
    
    if (squares <= 0) {
      return new Response(
        JSON.stringify({
          error: "invalid_squares",
          message: "Job must have estimated squares to schedule"
        }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    // 2. Load all active crews for this workspace
    const { data: crews, error: crewsError } = await supabase
      .from("crews")
      .select("*")
      .eq("workspace_id", job.workspace_id)
      .eq("is_active", true);

    if (crewsError || !crews || crews.length === 0) {
      return new Response(
        JSON.stringify({ error: "No crews available" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    // 3. Load existing scheduled jobs to find availability
    const { data: scheduled, error: scheduledError } = await supabase
      .from("roofing_scheduled_jobs")
      .select("*")
      .in("crew_id", crews.map(c => c.id))
      .neq("status", "canceled");

    // Build crew load map (squares scheduled per crew)
    const crewLoad: Record<string, number> = {};
    for (const c of crews) {
      crewLoad[c.id] = 0;
    }

    // Calculate current load for each crew
    const today = new Date();
    for (const s of scheduled || []) {
      if (s.status !== "canceled" && s.crew_id) {
        const endDate = new Date(s.end_date);
        // Only count jobs that are still active (not completed or in the past)
        if (endDate >= today) {
          crewLoad[s.crew_id] = (crewLoad[s.crew_id] || 0) + Number(s.total_squares || 0);
        }
      }
    }

    // 4. Choose best crew: least load / fits capacity
    let bestCrew = null;
    let bestScore = Infinity;

    for (const c of crews) {
      const currentLoad = crewLoad[c.id] || 0;
      const dailyCapacity = Number(c.daily_capacity_squares || 25);
      const weeklyCapacity = dailyCapacity * 7;
      const projectedLoad = currentLoad + squares;

      // Soft rule: avoid exceeding 150% weekly capacity
      if (projectedLoad <= weeklyCapacity * 1.5) {
        if (projectedLoad < bestScore) {
          bestScore = projectedLoad;
          bestCrew = c;
        }
      }
    }

    if (!bestCrew) {
      return new Response(
        JSON.stringify({ 
          error: "No crew capacity available",
          message: "All crews are at capacity. Consider adding a crew or delaying the job."
        }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    // 5. Determine start_date = earliest date crew is free
    // For v1: start tomorrow
    const startDate = new Date();
    startDate.setDate(startDate.getDate() + 1);
    startDate.setHours(0, 0, 0, 0);

    // End date = squares / capacity (rounded up)
    const dailyCapacity = Number(bestCrew.daily_capacity_squares || 25);
    const daysNeeded = Math.ceil(squares / dailyCapacity);
    const endDate = new Date(startDate);
    endDate.setDate(startDate.getDate() + daysNeeded - 1);

    // Format dates as YYYY-MM-DD
    const startDateStr = startDate.toISOString().slice(0, 10);
    const endDateStr = endDate.toISOString().slice(0, 10);

    // 6. Create schedule entry
    const { data: scheduledJob, error: scheduleError } = await supabase
      .from("roofing_scheduled_jobs")
      .insert({
        job_id,
        crew_id: bestCrew.id,
        start_date: startDateStr,
        end_date: endDateStr,
        total_squares: squares,
        status: "scheduled"
      })
      .select("*")
      .single();

    if (scheduleError) {
      return new Response(
        JSON.stringify({ 
          error: "Failed to create schedule",
          message: scheduleError.message 
        }),
        { status: 500, headers: { "Content-Type": "application/json" } }
      );
    }

    // 7. Update job scheduling_status
    await supabase
      .from("roofing_jobs")
      .update({ scheduling_status: "scheduled" })
      .eq("id", job_id);

    return new Response(
      JSON.stringify({
        scheduled: true,
        crew: {
          id: bestCrew.id,
          name: bestCrew.name,
          foreman_name: bestCrew.foreman_name,
          daily_capacity_squares: bestCrew.daily_capacity_squares
        },
        scheduledJob: {
          id: scheduledJob.id,
          start_date: scheduledJob.start_date,
          end_date: scheduledJob.end_date,
          total_squares: scheduledJob.total_squares,
          status: scheduledJob.status
        }
      }),
      { 
        status: 200,
        headers: { "Content-Type": "application/json" } 
      }
    );
  } catch (error: any) {
    console.error("Schedule job error:", error);
    return new Response(
      JSON.stringify({ 
        error: "Internal server error",
        message: error.message 
      }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
});



































