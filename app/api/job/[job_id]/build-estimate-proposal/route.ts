// Block 27140 — SmartSend Roofing Estimate & Proposal Generator v1
// API Route: Build Estimate & Proposal
// POST /api/job/[job_id]/build-estimate-proposal

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/server";

export async function POST(
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

    // Get job details to verify access and get workspace_id
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

    // Call edge function to build estimate and proposal
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

    const response = await fetch(`${supabaseUrl}/functions/v1/build_estimate_and_proposal`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${supabaseServiceRoleKey}`,
      },
      body: JSON.stringify({ job_id }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ error: "Unknown error" }));
      return NextResponse.json(
        { error: errorData.error || "Failed to build estimate and proposal" },
        { status: response.status }
      );
    }

    const data = await response.json();

    return NextResponse.json({
      status: "success",
      estimate_id: data.estimate_id,
      version: data.version,
      items_count: data.items_count,
      proposals_count: data.proposals_count,
    });
  } catch (error: any) {
    console.error("Error building estimate and proposal:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}



































