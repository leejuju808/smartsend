// Block 47000 — Update Day Schedule Status
// PATCH: Update the status of a specific day schedule

import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";

export async function PATCH(
  req: NextRequest,
  { params }: { params: { jobId: string; dayId: string } }
) {
  try {
    const supabase = createRouteHandlerClient({ cookies });
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const body = await req.json();
    const {
      status,
      completion_percentage,
      actual_hours,
      tasks,
      notes,
    } = body;

    // Validate status if provided
    if (status) {
      const validStatuses = ['pending', 'in_progress', 'completed', 'delayed', 'canceled'];
      if (!validStatuses.includes(status)) {
        return NextResponse.json(
          { error: `Invalid status. Must be one of: ${validStatuses.join(', ')}` },
          { status: 400 }
        );
      }
    }

    // Verify day schedule exists and belongs to job
    const { data: daySchedule, error: fetchError } = await supabase
      .from("job_day_schedules")
      .select("id, job_id, status")
      .eq("id", params.dayId)
      .eq("job_id", params.jobId)
      .single();

    if (fetchError || !daySchedule) {
      return NextResponse.json(
        { error: "Day schedule not found" },
        { status: 404 }
      );
    }

    // Build update object
    const updates: any = {};
    if (status) updates.status = status;
    if (completion_percentage !== undefined) {
      updates.completion_percentage = Math.max(0, Math.min(100, completion_percentage));
    }
    if (actual_hours !== undefined) updates.actual_hours = actual_hours;
    if (tasks) updates.tasks = tasks;
    if (notes !== undefined) updates.notes = notes;

    // If marking as completed, set completion_percentage to 100 if not already set
    if (status === 'completed' && completion_percentage === undefined) {
      updates.completion_percentage = 100;
    }

    // Update the day schedule
    const { data: updatedSchedule, error: updateError } = await supabase
      .from("job_day_schedules")
      .update(updates)
      .eq("id", params.dayId)
      .select(`
        *,
        crews (
          id,
          name,
          color
        )
      `)
      .single();

    if (updateError) {
      return NextResponse.json(
        { error: updateError.message },
        { status: 400 }
      );
    }

    // If this day is completed, check if all days are completed
    if (status === 'completed') {
      const { data: allDays, error: daysError } = await supabase
        .from("job_day_schedules")
        .select("id, status")
        .eq("job_id", params.jobId)
        .neq("status", "canceled");

      if (!daysError && allDays) {
        const allCompleted = allDays.every((day: any) => day.status === 'completed');
        
        if (allCompleted) {
          // Optionally update job status to completed
          // This would require checking which jobs table exists
          const { data: roofingJob } = await supabase
            .from("roofing_jobs")
            .select("id, status")
            .eq("id", params.jobId)
            .single();

          if (roofingJob && roofingJob.status !== 'completed') {
            await supabase
              .from("roofing_jobs")
              .update({ status: 'completed' })
              .eq("id", params.jobId);
          }
        }
      }
    }

    return NextResponse.json({
      schedule: updatedSchedule,
      message: `Day schedule updated to ${status || 'updated'}`,
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || "Unknown error" },
      { status: 500 }
    );
  }
}
































