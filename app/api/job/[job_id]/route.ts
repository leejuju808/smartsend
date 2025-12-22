// Block 27880 — SmartSend Roofing Crew Mobile Field App v1
// API Route: Get job details
// GET /api/job/[job_id]

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ job_id: string }> }
) {
  try {
    const { job_id } = await params;

    if (!job_id) {
      return NextResponse.json(
        { error: "job_id is required" },
        { status: 400 }
      );
    }

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    // Get job details
    const { data: job, error: jobError } = await supabase
      .from("roofing_jobs")
      .select("*")
      .eq("id", job_id)
      .single();

    if (jobError || !job) {
      return NextResponse.json(
        { error: "Job not found" },
        { status: 404 }
      );
    }

    return NextResponse.json({ job });
  } catch (error: any) {
    console.error("Error in job details API:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}



































