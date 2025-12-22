// Block 47000 — Job Day Schedules API
// GET: Get all day schedules for a job
// POST: Create a new day schedule

import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";

export async function GET(
  req: NextRequest,
  { params }: { params: { jobId: string } }
) {
  try {
    const supabase = createRouteHandlerClient({ cookies });
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    // Get all day schedules for this job
    const { data: daySchedules, error } = await supabase
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

    if (error) {
      return NextResponse.json(
        { error: error.message },
        { status: 400 }
      );
    }

    // Get weather data for each day
    const dayIds = (daySchedules || []).map((d: any) => d.id);
    let weatherData: any[] = [];
    
    if (dayIds.length > 0) {
      const { data: weather } = await supabase
        .from("job_day_weather")
        .select("*")
        .in("job_day_id", dayIds)
        .order("forecast_date", { ascending: true });
      
      weatherData = weather || [];
    }

    // Combine schedules with weather
    const schedulesWithWeather = (daySchedules || []).map((schedule: any) => ({
      ...schedule,
      weather: weatherData.find((w: any) => w.job_day_id === schedule.id) || null,
    }));

    return NextResponse.json({
      schedules: schedulesWithWeather,
      total_days: schedulesWithWeather.length,
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || "Unknown error" },
      { status: 500 }
    );
  }
}

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
      day_number,
      crew_id,
      start_date,
      end_date,
      scheduled_start_time,
      scheduled_end_time,
      tasks,
      estimated_hours,
      notes,
    } = body;

    if (!day_number || !start_date) {
      return NextResponse.json(
        { error: "day_number and start_date are required" },
        { status: 400 }
      );
    }

    // Verify job exists
    const { data: roofingJob } = await supabase
      .from("roofing_jobs")
      .select("id")
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

    // Verify crew exists if provided
    if (crew_id) {
      const { data: crew, error: crewError } = await supabase
        .from("crews")
        .select("id")
        .eq("id", crew_id)
        .single();

      if (crewError || !crew) {
        return NextResponse.json(
          { error: "Crew not found" },
          { status: 404 }
        );
      }
    }

    // Create day schedule
    const { data: daySchedule, error } = await supabase
      .from("job_day_schedules")
      .insert({
        job_id: params.jobId,
        day_number,
        crew_id: crew_id || null,
        start_date,
        end_date: end_date || start_date,
        scheduled_start_time: scheduled_start_time || null,
        scheduled_end_time: scheduled_end_time || null,
        tasks: tasks || [],
        estimated_hours: estimated_hours || null,
        notes: notes || null,
        status: "pending",
      })
      .select(`
        *,
        crews (
          id,
          name,
          color
        )
      `)
      .single();

    if (error) {
      return NextResponse.json(
        { error: error.message },
        { status: 400 }
      );
    }

    // Check for conflicts
    const { data: conflicts } = await supabase.rpc(
      "detect_crew_day_conflicts",
      {
        p_workspace_id: null,
        p_date_from: start_date,
        p_date_to: end_date || start_date,
      }
    );

    return NextResponse.json({
      schedule: daySchedule,
      conflicts: conflicts || [],
    }, { status: 201 });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || "Unknown error" },
      { status: 500 }
    );
  }
}
































