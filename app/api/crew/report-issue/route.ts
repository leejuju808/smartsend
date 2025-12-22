// Block 27880 — SmartSend Roofing Crew Mobile Field App v1
// API Route: Report job issue
// POST /api/crew/report-issue

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export async function POST(req: NextRequest) {
  try {
    const { job_id, crew_id, issue_type, description } = await req.json();

    if (!job_id || !crew_id || !description) {
      return NextResponse.json(
        { error: "job_id, crew_id, and description are required" },
        { status: 400 }
      );
    }

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    // Verify job exists
    const { data: job, error: jobError } = await supabase
      .from("roofing_jobs")
      .select("id")
      .eq("id", job_id)
      .single();

    if (jobError || !job) {
      return NextResponse.json(
        { error: "Job not found" },
        { status: 404 }
      );
    }

    // Create issue record
    const { data: issue, error: insertError } = await supabase
      .from("roofing_job_issues")
      .insert({
        job_id,
        crew_id,
        issue_type: issue_type || "general",
        description,
        resolved: false,
      })
      .select()
      .single();

    if (insertError) {
      console.error("Error creating job issue:", insertError);
      return NextResponse.json(
        { error: "Failed to create job issue", details: insertError.message },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true, issue });
  } catch (error: any) {
    console.error("Error in crew report issue API:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}



































