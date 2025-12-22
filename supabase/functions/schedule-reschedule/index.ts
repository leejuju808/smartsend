// Edge Function: Reschedule a job
// POST /functions/v1/schedule-reschedule

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
);

interface RescheduleRequest {
  schedule_id: string;
  new_start_date: string; // YYYY-MM-DD
  new_crew_id?: string; // Optional crew change
  reason?: string;
  notify_homeowner?: boolean; // Default true
}

Deno.serve(async (req) => {
  try {
    const body: RescheduleRequest = await req.json();

    if (!body.schedule_id || !body.new_start_date) {
      return new Response(
        JSON.stringify({ error: "schedule_id and new_start_date are required" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    // Get current schedule
    const { data: schedule, error: scheduleError } = await supabase
      .from("crew_schedules")
      .select("*, job_id, workspace_id, estimated_duration")
      .eq("id", body.schedule_id)
      .single();

    if (scheduleError || !schedule) {
      return new Response(
        JSON.stringify({ error: "Schedule not found" }),
        { status: 404, headers: { "Content-Type": "application/json" } }
      );
    }

    // Calculate new end date
    const startDate = new Date(body.new_start_date);
    const days_needed = Math.ceil((schedule.estimated_duration || 8) / 8);
    const endDate = new Date(startDate);
    endDate.setDate(endDate.getDate() + days_needed - 1);

    // Check for conflicts with new schedule
    const { data: conflicts } = await supabase
      .rpc("detect_schedule_conflicts", {
        p_workspace_id: schedule.workspace_id,
        p_start_date: body.new_start_date,
        p_end_date: endDate.toISOString().split("T")[0],
      });

    // Update schedule
    const updateData: any = {
      start_date: body.new_start_date,
      end_date: endDate.toISOString().split("T")[0],
    };

    if (body.new_crew_id) {
      updateData.crew_id = body.new_crew_id;
    }

    const { data: updatedSchedule, error: updateError } = await supabase
      .from("crew_schedules")
      .update(updateData)
      .eq("id", body.schedule_id)
      .select()
      .single();

    if (updateError) throw updateError;

    // The trigger will automatically log the change in schedule_changes table
    // But we can also update the reason if provided
    if (body.reason) {
      await supabase
        .from("schedule_changes")
        .update({ reason: body.reason })
        .eq("schedule_id", body.schedule_id)
        .order("created_at", { ascending: false })
        .limit(1);
    }

    // Notify homeowner if requested (default true)
    const shouldNotify = body.notify_homeowner !== false;
    if (shouldNotify) {
      // Get job and lead info for notification
      const { data: job } = await supabase
        .from("roofing_jobs")
        .select("id, lead_id, homeowner_name, address")
        .eq("id", schedule.job_id)
        .single();

      if (job?.lead_id) {
        // In production, integrate with notification system
        // For now, we'll mark as notified in schedule_changes
        await supabase
          .from("schedule_changes")
          .update({
            notified_homeowner: true,
            notified_at: new Date().toISOString(),
          })
          .eq("schedule_id", body.schedule_id)
          .order("created_at", { ascending: false })
          .limit(1);

        // TODO: Send actual notification via email/SMS/portal
        // This would integrate with your notification system
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        schedule: updatedSchedule,
        conflicts: conflicts || [],
        notified_homeowner: shouldNotify,
      }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Error rescheduling:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
});
































