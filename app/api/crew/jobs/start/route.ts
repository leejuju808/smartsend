// Block 42000 — SmartSend Roofing Crew App v1
// API Route: Start Job
// POST /api/crew/jobs/start

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

    // Verify member exists and user has access
    const { data: member, error: memberError } = await supabase
      .from("crew_members")
      .select("id, workspace_id, crew_id")
      .eq("id", member_id)
      .single();

    if (memberError || !member) {
      return NextResponse.json(
        { error: "Crew member not found" },
        { status: 404 }
      );
    }

    // Verify job exists and is in same workspace
    const { data: job, error: jobError } = await supabase
      .from("roofing_jobs")
      .select("id, workspace_id, status")
      .eq("id", job_id)
      .single();

    if (jobError || !job) {
      return NextResponse.json(
        { error: "Job not found" },
        { status: 404 }
      );
    }

    // Block 49000: Check if safety checklist is completed for today
    const today = new Date().toISOString().split("T")[0];
    const { data: safetyChecklist } = await supabase
      .from("safety_checklists")
      .select("id")
      .eq("job_id", job_id)
      .eq("completed", true)
      .gte("created_at", today)
      .single();

    if (!safetyChecklist) {
      return NextResponse.json(
        {
          error: "Safety checklist required",
          code: "SAFETY_CHECKLIST_REQUIRED",
          message: "You must complete the safety checklist before starting this job",
        },
        { status: 403 }
      );
    }

    // Log activity
    const { data: activity, error: activityError } = await supabase
      .from("job_activity_log")
      .insert({
        job_id,
        member_id,
        type: "start",
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

    // Update job status if needed
    if (job.status === "scheduled") {
      await supabase
        .from("roofing_jobs")
        .update({ status: "in_progress" })
        .eq("id", job_id);
    }

    // Block 252300: Send "Crew On The Way" message to customer
    try {
      // Calculate ETA (default to 30 minutes, could be improved with GPS)
      const eta = "30 minutes";
      
      // Call send message API instead of RPC (RPC expects jsonb, easier via API)
      await fetch(`${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/api/customer/send-message`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          job_id: job_id,
          event_type: "crew_on_way",
          template_vars: {
            eta: eta,
          },
          channel: "sms",
          metadata: {
            triggered_by: "crew_app_start",
            member_id: member_id,
            timestamp: new Date().toISOString(),
          },
        }),
      }).catch((err) => {
        console.error("Error calling send-message API:", err);
      });
    } catch (msgError) {
      // Don't fail the job start if message fails
      console.error("Error sending crew on way message:", msgError);
    }

    return NextResponse.json({
      success: true,
      activity,
      message: "Job started successfully",
    });
  } catch (error: any) {
    console.error("Error in start job API:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}








