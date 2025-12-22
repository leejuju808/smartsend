// Block 255700 — SmartSend Job Costing & Profit Engine v1
// API Route: Variance alerts
// GET /api/jobs/[jobId]/costing/variance-alerts - Get variance alerts
// PATCH /api/jobs/[jobId]/costing/variance-alerts/[alertId] - Acknowledge/resolve alert

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// GET variance alerts for a job
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

    const { searchParams } = new URL(req.url);
    const acknowledged = searchParams.get("acknowledged");
    const alertType = searchParams.get("type");

    let query = supabase
      .from("job_variance_alerts")
      .select("*")
      .eq("job_id", jobId);

    if (acknowledged !== null) {
      query = query.eq("acknowledged", acknowledged === "true");
    }

    if (alertType) {
      query = query.eq("alert_type", alertType);
    }

    query = query.order("created_at", { ascending: false });

    const { data: alerts, error } = await query;

    if (error) {
      console.error("Error fetching variance alerts:", error);
      return NextResponse.json(
        { error: "Failed to fetch alerts" },
        { status: 500 }
      );
    }

    return NextResponse.json({ alerts: alerts || [] });
  } catch (error: any) {
    console.error("Error in get variance alerts:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}





















