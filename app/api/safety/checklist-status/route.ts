// Block 49000 — SmartSend Roofing Safety Compliance v1
// API Route: Check Safety Checklist Status
// GET /api/safety/checklist-status?job_id=xxx
// Returns whether a safety checklist is required/completed for a job

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(req: NextRequest) {
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

    const searchParams = req.nextUrl.searchParams;
    const job_id = searchParams.get("job_id");

    if (!job_id) {
      return NextResponse.json(
        { error: "job_id is required" },
        { status: 400 }
      );
    }

    // Verify job exists
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

    // Check if checklist is completed for today
    const today = new Date().toISOString().split("T")[0];
    const { data: checklist } = await supabase
      .from("safety_checklists")
      .select("*")
      .eq("job_id", job_id)
      .eq("completed", true)
      .gte("created_at", today)
      .order("created_at", { ascending: false })
      .limit(1)
      .single();

    // Get safety score if exists
    const { data: safetyScore } = await supabase
      .from("safety_scores")
      .select("*")
      .eq("job_id", job_id)
      .single();

    // Get safety photos for today
    const { data: safetyPhotos } = await supabase
      .from("safety_photos")
      .select("*")
      .eq("job_id", job_id)
      .gte("created_at", today);

    return NextResponse.json({
      success: true,
      job_id,
      has_completed_checklist: !!checklist,
      checklist: checklist || null,
      safety_score: safetyScore || null,
      safety_photos: safetyPhotos || [],
      can_start_job: !!checklist, // Job can only start if checklist is completed
    });
  } catch (error: any) {
    console.error("Error in checklist status API:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}
































