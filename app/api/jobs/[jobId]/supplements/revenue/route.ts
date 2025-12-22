// Block 27640 — SmartSend Roofing Insurance Supplement Intelligence v1
// API Route: POST /api/jobs/[jobId]/supplements/revenue
// Tracks approved supplement revenue

import { NextRequest, NextResponse } from "next/server";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ jobId: string }> }
) {
  try {
    const { jobId } = await params;
    const { approved_amount, adjuster_name, adjuster_email } = await req.json();

    if (!approved_amount) {
      return NextResponse.json(
        { error: "approved_amount is required" },
        { status: 400 }
      );
    }

    const supabase = createRouteHandlerClient({ cookies });

    // Check authentication
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Get job to find workspace_id
    const { data: job, error: jobError } = await supabase
      .from("roofing_jobs")
      .select("workspace_id")
      .eq("id", jobId)
      .single();

    if (jobError || !job) {
      return NextResponse.json(
        { error: "Job not found" },
        { status: 404 }
      );
    }

    // Insert supplement revenue record
    const { data: revenue, error } = await supabase
      .from("roofing_supplement_revenue")
      .insert({
        job_id: jobId,
        workspace_id: job.workspace_id,
        approved_amount: Number(approved_amount),
        adjuster_name: adjuster_name || null,
        adjuster_email: adjuster_email || null,
        approved_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (error) {
      console.error("Error inserting supplement revenue:", error);
      return NextResponse.json(
        { error: error.message },
        { status: 500 }
      );
    }

    // Update recommendation statuses to 'approved' if they exist
    await supabase
      .from("roofing_supplement_recommendations")
      .update({ status: "approved" })
      .eq("job_id", jobId)
      .eq("status", "submitted");

    return NextResponse.json({ revenue });
  } catch (error: any) {
    console.error("Error in POST /api/jobs/[jobId]/supplements/revenue:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}



































