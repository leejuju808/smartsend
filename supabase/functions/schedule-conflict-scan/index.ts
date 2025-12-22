// Edge Function: Scan for scheduling conflicts
// POST /functions/v1/schedule-conflict-scan

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
);

interface ConflictScanRequest {
  workspace_id: string;
  start_date?: string; // Optional: scan specific date range
  end_date?: string;
  crew_id?: string; // Optional: scan specific crew
  auto_resolve?: boolean; // Auto-resolve conflicts where possible
}

Deno.serve(async (req) => {
  try {
    const body: ConflictScanRequest = await req.json();

    if (!body.workspace_id) {
      return new Response(
        JSON.stringify({ error: "workspace_id is required" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    // Determine date range
    const startDate = body.start_date || new Date().toISOString().split("T")[0];
    const endDate = body.end_date || new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split("T")[0];

    // Get all active schedules in the date range
    let query = supabase
      .from("crew_schedules")
      .select("id, job_id, crew_id, start_date, end_date, status, workspace_id")
      .eq("workspace_id", body.workspace_id)
      .in("status", ["scheduled", "in_progress"])
      .lte("start_date", endDate)
      .gte("end_date", startDate);

    if (body.crew_id) {
      query = query.eq("crew_id", body.crew_id);
    }

    const { data: schedules, error: schedulesError } = await query;

    if (schedulesError) throw schedulesError;

    const conflicts: any[] = [];

    // Check for overlapping schedules for the same crew
    for (let i = 0; i < schedules.length; i++) {
      for (let j = i + 1; j < schedules.length; j++) {
        const s1 = schedules[i];
        const s2 = schedules[j];

        // Only check if same crew
        if (s1.crew_id !== s2.crew_id) continue;

        // Check for date overlap
        const s1Start = new Date(s1.start_date);
        const s1End = new Date(s1.end_date);
        const s2Start = new Date(s2.start_date);
        const s2End = new Date(s2.end_date);

        if (s1Start <= s2End && s1End >= s2Start) {
          // Overlap detected
          const overlapStart = s1Start > s2Start ? s1Start : s2Start;
          const overlapEnd = s1End < s2End ? s1End : s2End;
          const overlapDays = Math.ceil((overlapEnd.getTime() - overlapStart.getTime()) / (1000 * 60 * 60 * 24)) + 1;

          // Determine severity
          let severity = "medium";
          if (s1Start.getTime() === s2Start.getTime()) {
            severity = "critical"; // Same start date
          } else if (overlapDays >= 2) {
            severity = "high";
          }

          // Check if conflict already exists
          const { data: existing } = await supabase
            .from("schedule_conflicts")
            .select("id")
            .eq("workspace_id", body.workspace_id)
            .eq("schedule_id_1", s1.id)
            .eq("schedule_id_2", s2.id)
            .eq("resolved", false)
            .single();

          if (!existing) {
            // Create conflict record
            const conflictData = {
              workspace_id: body.workspace_id,
              conflict_type: "crew_double_booked",
              severity,
              schedule_id_1: s1.id,
              schedule_id_2: s2.id,
              job_id_1: s1.job_id,
              job_id_2: s2.job_id,
              crew_id: s1.crew_id,
              conflict_date: overlapStart.toISOString().split("T")[0],
              details: {
                overlap_days: overlapDays,
                schedule_1_start: s1.start_date,
                schedule_1_end: s1.end_date,
                schedule_2_start: s2.start_date,
                schedule_2_end: s2.end_date,
              },
              resolved: false,
            };

            const { data: conflict, error: conflictError } = await supabase
              .from("schedule_conflicts")
              .insert(conflictData)
              .select()
              .single();

            if (!conflictError && conflict) {
              conflicts.push(conflict);
            }
          }
        }
      }
    }

    // Auto-resolve if requested (simple strategy: move later job)
    if (body.auto_resolve && conflicts.length > 0) {
      for (const conflict of conflicts) {
        if (conflict.severity === "critical" || conflict.severity === "high") {
          // Get the schedules
          const { data: schedule1 } = await supabase
            .from("crew_schedules")
            .select("id, start_date, end_date, estimated_duration")
            .eq("id", conflict.schedule_id_1)
            .single();

          const { data: schedule2 } = await supabase
            .from("crew_schedules")
            .select("id, start_date, end_date, estimated_duration")
            .eq("id", conflict.schedule_id_2)
            .single();

          if (schedule1 && schedule2) {
            // Move the later-starting job to after the earlier one
            const laterSchedule = new Date(schedule1.start_date) > new Date(schedule2.start_date) ? schedule1 : schedule2;
            const earlierEnd = new Date(schedule1.start_date) < new Date(schedule2.start_date) 
              ? new Date(schedule1.end_date)
              : new Date(schedule2.end_date);

            const newStart = new Date(earlierEnd);
            newStart.setDate(newStart.getDate() + 1); // Start day after

            const daysNeeded = Math.ceil((laterSchedule.estimated_duration || 8) / 8);
            const newEnd = new Date(newStart);
            newEnd.setDate(newEnd.getDate() + daysNeeded - 1);

            await supabase
              .from("crew_schedules")
              .update({
                start_date: newStart.toISOString().split("T")[0],
                end_date: newEnd.toISOString().split("T")[0],
              })
              .eq("id", laterSchedule.id);

            // Mark conflict as resolved
            await supabase
              .from("schedule_conflicts")
              .update({
                resolved: true,
                resolved_at: new Date().toISOString(),
                resolution_action: "auto_rescheduled",
              })
              .eq("id", conflict.id);
          }
        }
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        conflicts_found: conflicts.length,
        conflicts,
        auto_resolved: body.auto_resolve ? conflicts.filter(c => c.severity === "critical" || c.severity === "high").length : 0,
      }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Error scanning conflicts:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
});
































