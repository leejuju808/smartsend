// Block 27640 — SmartSend Roofing Insurance Supplement Intelligence v1
// API Route: GET /api/jobs/[jobId]/supplements
// Returns supplement recommendations for a job

import { NextRequest, NextResponse } from "next/server";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ jobId: string }> }
) {
  try {
    const { jobId } = await params;
    const supabase = createRouteHandlerClient({ cookies });

    // Check authentication
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Fetch supplement recommendations
    const { data: recommendations, error } = await supabase
      .from("roofing_supplement_recommendations")
      .select("*")
      .eq("job_id", jobId)
      .order("created_at", { ascending: false });

    if (error) {
      console.error("Error fetching supplement recommendations:", error);
      return NextResponse.json(
        { error: error.message },
        { status: 500 }
      );
    }

    // Fetch supplement revenue for this job
    const { data: revenue } = await supabase
      .from("roofing_supplement_revenue")
      .select("*")
      .eq("job_id", jobId)
      .order("approved_at", { ascending: false });

    // Calculate totals
    const totalPending = recommendations
      ?.filter((r) => r.status === "pending")
      .reduce((sum, r) => sum + (Number(r.estimated_cost) || 0), 0) || 0;

    const totalApproved = revenue?.reduce(
      (sum, r) => sum + (Number(r.approved_amount) || 0),
      0
    ) || 0;

    return NextResponse.json({
      items: recommendations || [],
      revenue: revenue || [],
      totals: {
        pending: totalPending,
        approved: totalApproved,
      },
    });
  } catch (error: any) {
    console.error("Error in GET /api/jobs/[jobId]/supplements:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}



































