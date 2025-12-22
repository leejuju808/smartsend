// Block 27140 — SmartSend Roofing Estimate & Proposal Generator v1
// API Route: Get Proposal Data
// GET /api/job/[job_id]/proposal

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/server";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ job_id: string }> }
) {
  try {
    const { job_id } = await params;
    const supabase = createClient();
    const serviceSupabase = createServiceClient();

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

    // Get job details to verify access
    const { data: job, error: jobError } = await serviceSupabase
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

    // Get estimate
    const { data: estimate } = await serviceSupabase
      .from("roofing_estimates")
      .select("*")
      .eq("job_id", job_id)
      .order("version", { ascending: false })
      .limit(1)
      .single();

    let line_items: any[] = [];
    let proposals: any[] = [];

    if (estimate) {
      // Get line items
      const { data: li } = await serviceSupabase
        .from("roofing_estimate_line_items")
        .select("*")
        .eq("estimate_id", estimate.id)
        .order("sort_order", { ascending: true });
      line_items = li || [];

      // Get proposals
      const { data: props } = await serviceSupabase
        .from("roofing_proposals")
        .select("*")
        .eq("job_id", job_id)
        .order("tier", { ascending: true });
      proposals = props || [];
    }

    return NextResponse.json({
      estimate,
      line_items,
      proposals,
    });
  } catch (error: any) {
    console.error("Error fetching proposal:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}



































