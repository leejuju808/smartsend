// Block 51000 — SmartSend Roofing Crew Payroll + Labor Cost Tracking System v1
// API Route: Labor Cost Forecast
// GET /api/payroll/forecast?workspace_id=xxx&weeks_ahead=2

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(req: NextRequest) {
  try {
    const supabase = await createClient();
    
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

    const { searchParams } = new URL(req.url);
    const workspace_id = searchParams.get("workspace_id");
    const weeks_ahead = parseInt(searchParams.get("weeks_ahead") || "2");

    if (!workspace_id) {
      return NextResponse.json(
        { error: "workspace_id is required" },
        { status: 400 }
      );
    }

    // Get average labor cost per job (from historical data)
    const { data: historicalJobs, error: historicalError } = await supabase
      .from("timecards")
      .select("job_id, total_pay")
      .eq("status", "completed")
      .not("total_pay", "is", null)
      .limit(100);

    if (historicalError) {
      return NextResponse.json(
        { error: "Failed to fetch historical data", details: historicalError.message },
        { status: 500 }
      );
    }

    // Calculate average labor cost per job
    const jobCosts = new Map<string, number>();
    historicalJobs?.forEach((tc) => {
      if (tc.job_id) {
        const current = jobCosts.get(tc.job_id) || 0;
        jobCosts.set(tc.job_id, current + Number(tc.total_pay || 0));
      }
    });

    const avgLaborCostPerJob =
      Array.from(jobCosts.values()).reduce((sum, cost) => sum + cost, 0) / (jobCosts.size || 1);

    // Get scheduled jobs from production calendar
    // This is a simplified version - integrate with your production calendar
    const startDate = new Date();
    const endDate = new Date();
    endDate.setDate(endDate.getDate() + weeks_ahead * 7);

    // TODO: Query production calendar for scheduled jobs
    // For now, return a simple forecast
    const forecast = {
      weeks_ahead,
      start_date: startDate.toISOString().split("T")[0],
      end_date: endDate.toISOString().split("T")[0],
      estimated_jobs: 0, // Would come from production calendar
      estimated_labor_cost: 0, // Would be estimated_jobs * avgLaborCostPerJob
      average_labor_cost_per_job: avgLaborCostPerJob,
      message: "Forecast generated (simplified - integrate with production calendar)",
    };

    return NextResponse.json({
      success: true,
      forecast,
    });
  } catch (error: any) {
    console.error("Error in payroll forecast API:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}
































