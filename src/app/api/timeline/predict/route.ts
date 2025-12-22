// Block 64000 — Production Timeline Optimizer
// POST /api/timeline/predict
// Calculates predicted job duration and completion time

import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";

export async function POST(req: NextRequest) {
  try {
    const supabase = createRouteHandlerClient({ cookies });
    const { data: { user } } = await supabase.auth.getUser();
    
    if (!user) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const body = await req.json();
    const { job_id, roof_size_squares, layers, pitch, crew_id, job_type } = body;

    if (!job_id) {
      return NextResponse.json(
        { error: "job_id is required" },
        { status: 400 }
      );
    }

    // Get workspace_id from job
    const { data: job, error: jobError } = await supabase
      .from("roofing_jobs")
      .select("workspace_id, crew_id, job_type, scheduled_start_date")
      .eq("id", job_id)
      .single();

    if (jobError || !job) {
      return NextResponse.json(
        { error: "Job not found" },
        { status: 404 }
      );
    }

    // Verify user has access to workspace
    const { data: member } = await supabase
      .from("workspace_members")
      .select("workspace_id")
      .eq("workspace_id", job.workspace_id)
      .eq("user_id", user.id)
      .single();

    if (!member) {
      return NextResponse.json(
        { error: "Access denied" },
        { status: 403 }
      );
    }

    // Calculate predicted completion time
    const { data: predictedEnd, error: calcError } = await supabase.rpc(
      "calculate_predicted_completion",
      {
        p_job_id: job_id,
        p_roof_size_squares: roof_size_squares || null,
        p_layers: layers || 1,
        p_pitch: pitch || null,
        p_crew_id: crew_id || job.crew_id || null,
        p_job_type: job_type || job.job_type || "roof_replacement"
      }
    );

    if (calcError) {
      console.error("Error calculating prediction:", calcError);
      return NextResponse.json(
        { error: "Failed to calculate prediction", details: calcError.message },
        { status: 500 }
      );
    }

    // Get or create production timeline record
    const { data: existingTimeline } = await supabase
      .from("production_timeline")
      .select("*")
      .eq("job_id", job_id)
      .order("created_at", { ascending: false })
      .limit(1)
      .single();

    const timelineData = {
      job_id,
      workspace_id: job.workspace_id,
      predicted_end: predictedEnd,
      predicted_start: job.scheduled_start_date 
        ? new Date(`${job.scheduled_start_date}T07:00:00`).toISOString()
        : new Date().toISOString(),
      updated_at: new Date().toISOString()
    };

    let timeline;
    if (existingTimeline) {
      const { data: updated, error: updateError } = await supabase
        .from("production_timeline")
        .update(timelineData)
        .eq("id", existingTimeline.id)
        .select()
        .single();

      if (updateError) {
        console.error("Error updating timeline:", updateError);
        return NextResponse.json(
          { error: "Failed to update timeline", details: updateError.message },
          { status: 500 }
        );
      }
      timeline = updated;
    } else {
      const { data: created, error: createError } = await supabase
        .from("production_timeline")
        .insert(timelineData)
        .select()
        .single();

      if (createError) {
        console.error("Error creating timeline:", createError);
        return NextResponse.json(
          { error: "Failed to create timeline", details: createError.message },
          { status: 500 }
        );
      }
      timeline = created;
    }

    // Calculate duration
    const predictedStart = new Date(timeline.predicted_start);
    const predictedEndDate = new Date(timeline.predicted_end);
    const durationHours = (predictedEndDate.getTime() - predictedStart.getTime()) / (1000 * 60 * 60);

    // Update duration
    await supabase
      .from("production_timeline")
      .update({ predicted_duration_hours: durationHours })
      .eq("id", timeline.id);

    return NextResponse.json({
      success: true,
      timeline: {
        ...timeline,
        predicted_duration_hours: durationHours,
        predicted_start: timeline.predicted_start,
        predicted_end: timeline.predicted_end
      },
      predicted_completion: predictedEnd,
      predicted_duration_hours: durationHours
    });
  } catch (error: any) {
    console.error("Error in /api/timeline/predict:", error);
    return NextResponse.json(
      { error: error.message || "Unknown error" },
      { status: 500 }
    );
  }
}

// GET /api/timeline/predict?job_id=xxx
// Get existing prediction for a job
export async function GET(req: NextRequest) {
  try {
    const supabase = createRouteHandlerClient({ cookies });
    const { data: { user } } = await supabase.auth.getUser();
    
    if (!user) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const job_id = searchParams.get("job_id");

    if (!job_id) {
      return NextResponse.json(
        { error: "job_id is required" },
        { status: 400 }
      );
    }

    // Get timeline
    const { data: timeline, error } = await supabase
      .from("production_timeline")
      .select("*")
      .eq("job_id", job_id)
      .order("created_at", { ascending: false })
      .limit(1)
      .single();

    if (error && error.code !== 'PGRST116') { // PGRST116 = no rows returned
      console.error("Error fetching timeline:", error);
      return NextResponse.json(
        { error: "Failed to fetch timeline", details: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      timeline: timeline || null
    });
  } catch (error: any) {
    console.error("Error in GET /api/timeline/predict:", error);
    return NextResponse.json(
      { error: error.message || "Unknown error" },
      { status: 500 }
    );
  }
}




























