// Block 27940 — SmartSend Roofing QA & Completion Verification Engine v1
// API Route: Get QA data for a job
// GET /api/jobs/[jobId]/qa

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ jobId: string }> }
) {
  try {
    const supabase = createClient();
    const { jobId } = await params;

    // Ensure user is authenticated
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

    // Get QA run
    const { data: qa_run, error: qaError } = await supabase
      .from("roofing_job_qa_runs")
      .select("*")
      .eq("job_id", jobId)
      .order("created_at", { ascending: false })
      .limit(1)
      .single();

    if (qaError && qaError.code !== "PGRST116") {
      // PGRST116 is "not found" which is OK
      console.error("Error fetching QA run:", qaError);
      return NextResponse.json(
        { error: "Failed to fetch QA data" },
        { status: 500 }
      );
    }

    if (!qa_run) {
      return NextResponse.json({ qa_run: null, findings: [] });
    }

    // Get findings
    const { data: findings, error: findingsError } = await supabase
      .from("roofing_job_qa_findings")
      .select("*")
      .eq("qa_run_id", qa_run.id)
      .order("severity", { ascending: false })
      .order("created_at", { ascending: true });

    if (findingsError) {
      console.error("Error fetching findings:", findingsError);
      return NextResponse.json(
        { error: "Failed to fetch findings" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      qa_run,
      findings: findings || [],
    });
  } catch (error: any) {
    console.error("Error in QA route:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}



































