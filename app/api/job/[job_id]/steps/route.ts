// Block 27880 — SmartSend Roofing Crew Mobile Field App v1
// API Route: Get job steps
// GET /api/job/[job_id]/steps

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

    // Get all steps for this job
    const { data: steps, error: stepsError } = await supabase
      .from("roofing_job_steps")
      .select("*")
      .eq("job_id", job_id)
      .order("created_at", { ascending: true });

    if (stepsError) {
      console.error("Error fetching job steps:", stepsError);
      return NextResponse.json(
        { error: "Failed to fetch steps", details: stepsError.message },
        { status: 500 }
      );
    }

    return NextResponse.json({ steps: steps || [] });
  } catch (error: any) {
    console.error("Error in job steps API:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}



































