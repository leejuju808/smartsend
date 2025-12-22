// Block 47000 — Shift Schedule for Weather
// POST: Shift all future days of a job when a day is delayed due to weather

import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";

export async function POST(
  req: NextRequest,
  { params }: { params: { jobId: string } }
) {
  try {
    const supabase = createRouteHandlerClient({ cookies });
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const body = await req.json();
    const {
      delayed_day_number,
      shift_days = 1,
      reason,
    } = body;

    if (!delayed_day_number) {
      return NextResponse.json(
        { error: "delayed_day_number is required" },
        { status: 400 }
      );
    }

    if (shift_days < 1) {
      return NextResponse.json(
        { error: "shift_days must be at least 1" },
        { status: 400 }
      );
    }

    // Verify job exists
    const { data: roofingJob } = await supabase
      .from("roofing_jobs")
      .select("id, workspace_id")
      .eq("id", params.jobId)
      .single();

    const { data: regularJob } = await supabase
      .from("jobs")
      .select("id")
      .eq("id", params.jobId)
      .single();

    if (!roofingJob && !regularJob) {
      return NextResponse.json(
        { error: "Job not found" },
        { status: 404 }
      );
    }

    // Verify the delayed day exists
    const { data: delayedDay, error: dayError } = await supabase
      .from("job_day_schedules")
      .select("id, day_number, start_date, crew_id")
      .eq("job_id", params.jobId)
      .eq("day_number", delayed_day_number)
      .single();

    if (dayError || !delayedDay) {
      return NextResponse.json(
        { error: `Day ${delayed_day_number} not found for this job` },
        { status: 404 }
      );
    }

    // Call the database function to shift schedule
    const { data: shiftedDays, error: shiftError } = await supabase.rpc(
      "shift_job_schedule_for_weather",
      {
        p_job_id: params.jobId,
        p_delayed_day_number: delayed_day_number,
        p_shift_days: shift_days,
      }
    );

    if (shiftError) {
      console.error("Shift schedule error:", shiftError);
      return NextResponse.json(
        { error: shiftError.message || "Failed to shift schedule" },
        { status: 400 }
      );
    }

    // Update weather record for the delayed day
    if (reason) {
      const { data: weatherRecord } = await supabase
        .from("job_day_weather")
        .select("id")
        .eq("job_day_id", delayedDay.id)
        .single();

      if (weatherRecord) {
        await supabase
          .from("job_day_weather")
          .update({
            delay_recommended: true,
            workable: false,
          })
          .eq("id", weatherRecord.id);
      } else {
        // Create weather record
        await supabase
          .from("job_day_weather")
          .insert({
            job_day_id: delayedDay.id,
            forecast_date: delayedDay.start_date,
            risk_level: 'high',
            workable: false,
            delay_recommended: true,
            conditions: reason,
          });
      }
    }

    // Get updated schedule to return
    const { data: updatedSchedule } = await supabase
      .from("job_day_schedules")
      .select(`
        *,
        crews (
          id,
          name,
          color
        )
      `)
      .eq("job_id", params.jobId)
      .order("day_number", { ascending: true });

    // Check for new conflicts after shift
    const workspaceId = roofingJob?.workspace_id || null;
    const { data: conflicts } = await supabase.rpc(
      "detect_crew_day_conflicts",
      {
        p_workspace_id: workspaceId,
        p_date_from: new Date().toISOString().split('T')[0],
        p_date_to: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      }
    );

    return NextResponse.json({
      shifted_days: shiftedDays || [],
      updated_schedule: updatedSchedule || [],
      conflicts: conflicts || [],
      message: `Shifted ${shiftedDays?.length || 0} day(s) forward by ${shift_days} day(s)`,
    });
  } catch (error: any) {
    console.error("Shift schedule for weather error:", error);
    return NextResponse.json(
      { error: error.message || "Unknown error" },
      { status: 500 }
    );
  }
}
































