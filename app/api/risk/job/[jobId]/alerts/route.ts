// Block 63000 — SmartSend Roofing Risk Detection + Warranty Liability AI System v1
// API Route: Get Risk Alerts for Job
// GET /api/risk/job/[jobId]/alerts

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * Returns risk alerts for a specific job
 * Used by crew app to show risk feedback
 */
export async function GET(
  req: NextRequest,
  { params }: { params: { jobId: string } }
) {
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

    const jobId = params.jobId;

    if (!jobId) {
      return NextResponse.json(
        { error: "jobId is required" },
        { status: 400 }
      );
    }

    // Get risk alerts for this job
    const { data: alerts, error: alertsError } = await supabase
      .from("risk_alerts")
      .select("*")
      .eq("job_id", jobId)
      .eq("resolved", false)
      .order("created_at", { ascending: false });

    if (alertsError) {
      console.error("Error fetching alerts:", alertsError);
      return NextResponse.json(
        { error: "Failed to fetch alerts" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      alerts: alerts || [],
    });
  } catch (error: any) {
    console.error("Error in risk alerts API:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}




























