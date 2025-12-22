// Block 255700 — SmartSend Job Costing & Profit Engine v1
// API Route: Repair job profitability
// GET /api/jobs/[jobId]/costing/repair-profit - Get repair profit
// POST /api/jobs/[jobId]/costing/repair-profit - Calculate repair profit

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// GET repair job profit
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ jobId: string }> }
) {
  try {
    const { jobId } = await params;
    const supabase = await createClient();

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Verify job is a repair
    const { data: job, error: jobError } = await supabase
      .from("roofing_jobs")
      .select("id, job_type")
      .eq("id", jobId)
      .single();

    if (jobError || !job) {
      return NextResponse.json(
        { error: "Job not found" },
        { status: 404 }
      );
    }

    if (job.job_type !== "repair") {
      return NextResponse.json(
        { error: "Job is not a repair job" },
        { status: 400 }
      );
    }

    // Get repair job profit
    const { data: repairProfit, error } = await supabase
      .from("repair_job_profits")
      .select("*")
      .eq("job_id", jobId)
      .single();

    if (error && error.code !== "PGRST116") {
      console.error("Error fetching repair profit:", error);
      return NextResponse.json(
        { error: "Failed to fetch repair profit" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      repair_profit: repairProfit || null,
    });
  } catch (error: any) {
    console.error("Error in get repair profit:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}

// POST calculate repair job profit
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ jobId: string }> }
) {
  try {
    const { jobId } = await params;
    const supabase = await createClient();

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Call calculate_repair_job_profit function
    const { data: result, error: calcError } = await supabase.rpc(
      "calculate_repair_job_profit",
      { p_job_id: jobId }
    );

    if (calcError) {
      console.error("Error calculating repair profit:", calcError);
      return NextResponse.json(
        {
          error: "Failed to calculate repair profit",
          details: calcError.message,
        },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      calculation: result,
    });
  } catch (error: any) {
    console.error("Error in calculate repair profit:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}





















