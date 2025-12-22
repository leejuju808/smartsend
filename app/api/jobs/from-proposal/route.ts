// Block 22270 — SmartSend Roofing Proposal → Job Conversion Flow v1
// API Route: Convert Proposal to Job
// POST /api/jobs/from-proposal

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST(req: NextRequest) {
  try {
    const supabase = createClient();
    const body = await req.json();
    const { proposal_id } = body;

    if (!proposal_id) {
      return NextResponse.json(
        { error: "Missing proposal_id" },
        { status: 400 }
      );
    }

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

    // Verify proposal exists and user has access
    const { data: proposal, error: proposalError } = await supabase
      .from("proposals")
      .select("id, workspace_id, status, job_id")
      .eq("id", proposal_id)
      .single();

    if (proposalError || !proposal) {
      return NextResponse.json(
        { error: "Proposal not found" },
        { status: 404 }
      );
    }

    // Verify user has access to workspace
    const { data: membership } = await supabase
      .from("workspace_members")
      .select("workspace_id")
      .eq("workspace_id", proposal.workspace_id)
      .eq("user_id", user.id)
      .single();

    if (!membership) {
      return NextResponse.json(
        { error: "Access denied" },
        { status: 403 }
      );
    }

    // Call SQL function to convert proposal to job
    const { data: job_id, error: rpcError } = await supabase.rpc(
      "convert_proposal_to_job",
      {
        p_proposal_id: proposal_id,
      }
    );

    if (rpcError) {
      console.error("Error converting proposal to job:", rpcError);
      return NextResponse.json(
        { error: rpcError.message || "Failed to convert proposal to job" },
        { status: 500 }
      );
    }

    return NextResponse.json(
      { success: true, job_id },
      {
        headers: { "Content-Type": "application/json" },
      }
    );
  } catch (error: any) {
    console.error("Error in convert proposal to job:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}








































