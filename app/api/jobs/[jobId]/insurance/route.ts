// Block 22420 — SmartSend Roofing Insurance Claim Tracker v1
// API Route: Get Insurance Claim for a Job
// GET /api/jobs/[jobId]/insurance

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ jobId: string }> }
) {
  try {
    const { jobId } = await context.params;
    const supabase = createClient();

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

    // Verify job exists and get workspace_id
    const { data: job, error: jobError } = await supabase
      .from("roofing_jobs")
      .select("id, workspace_id, insurance_job, insurance_claim_status, insurance_balance_remaining")
      .eq("id", jobId)
      .single();

    if (jobError || !job) {
      return NextResponse.json(
        { error: "Job not found" },
        { status: 404 }
      );
    }

    // Verify user has access to workspace
    const { data: membership } = await supabase
      .from("workspace_members")
      .select("workspace_id")
      .eq("workspace_id", job.workspace_id)
      .eq("user_id", user.id)
      .single();

    if (!membership) {
      return NextResponse.json(
        { error: "Access denied" },
        { status: 403 }
      );
    }

    // Fetch insurance claim
    const { data: claim, error: claimError } = await supabase
      .from("job_insurance_claims")
      .select("*")
      .eq("job_id", jobId)
      .maybeSingle();

    if (claimError) {
      console.error("Error fetching insurance claim:", claimError);
      return NextResponse.json(
        { error: claimError.message },
        { status: 500 }
      );
    }

    return NextResponse.json(
      {
        claim: claim || null,
        job: {
          insurance_job: job.insurance_job,
          insurance_claim_status: job.insurance_claim_status,
          insurance_balance_remaining: job.insurance_balance_remaining,
        },
      },
      {
        headers: { "Content-Type": "application/json" },
      }
    );
  } catch (error: any) {
    console.error("Error in get insurance claim:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}








































