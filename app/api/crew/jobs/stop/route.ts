// Block 42000 — SmartSend Roofing Crew App v1
// API Route: Stop Job
// POST /api/crew/jobs/stop

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    const body = await req.json();
    const { job_id, member_id, gps_latitude, gps_longitude } = body;

    if (!job_id || !member_id) {
      return NextResponse.json(
        { error: "job_id and member_id are required" },
        { status: 400 }
      );
    }

    // Verify member exists
    const { data: member, error: memberError } = await supabase
      .from("crew_members")
      .select("id, workspace_id")
      .eq("id", member_id)
      .single();

    if (memberError || !member) {
      return NextResponse.json(
        { error: "Crew member not found" },
        { status: 404 }
      );
    }

    // Verify job exists
    const { data: job, error: jobError } = await supabase
      .from("roofing_jobs")
      .select("id, workspace_id")
      .eq("id", job_id)
      .single();

    if (jobError || !job) {
      return NextResponse.json(
        { error: "Job not found" },
        { status: 404 }
      );
    }

    // Log activity
    const { data: activity, error: activityError } = await supabase
      .from("job_activity_log")
      .insert({
        job_id,
        member_id,
        type: "stop",
        payload: {
          timestamp: new Date().toISOString(),
        },
        gps_latitude: gps_latitude || null,
        gps_longitude: gps_longitude || null,
      })
      .select()
      .single();

    if (activityError) {
      console.error("Error logging activity:", activityError);
      return NextResponse.json(
        { error: "Failed to log activity" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      activity,
      message: "Job stopped successfully",
    });
  } catch (error: any) {
    console.error("Error in stop job API:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}































