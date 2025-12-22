// Block 24420 — SmartSend Roofing Job Health Score v2
// API Route: Get Job Health Alerts
// GET /api/jobs/[jobId]/health-alerts

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ jobId: string }> }
) {
  try {
    const supabase = createClient();
    const { jobId } = await params;

    // Ensure user is authenticated
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Get job and verify access
    const { data: job, error: jobError } = await supabase
      .from("roofing_jobs")
      .select("id, workspace_id")
      .eq("id", jobId)
      .single();

    if (jobError || !job) {
      return NextResponse.json(
        { error: "Job not found" },
        { status: 404 }
      );
    }

    // Verify user has access to this workspace
    const { data: membership } = await supabase
      .from("workspace_members")
      .select("workspace_id")
      .eq("workspace_id", job.workspace_id)
      .eq("user_id", user.id)
      .single();

    if (!membership) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    // Get active alerts
    const { data: alerts, error: alertsError } = await supabase
      .from("job_health_alerts")
      .select("*")
      .eq("job_id", jobId)
      .eq("status", "active")
      .order("created_at", { ascending: false })
      .limit(10);

    if (alertsError) {
      console.error("Error fetching health alerts:", alertsError);
      return NextResponse.json(
        { error: "Failed to fetch health alerts" },
        { status: 500 }
      );
    }

    return NextResponse.json({ alerts: alerts || [] });
  } catch (error: any) {
    console.error("Error in health-alerts API:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}

// PATCH endpoint to acknowledge an alert
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ jobId: string }> }
) {
  try {
    const supabase = createClient();
    const { jobId } = await params;
    const body = await req.json();
    const { alertId } = body;

    if (!alertId) {
      return NextResponse.json(
        { error: "Missing alertId" },
        { status: 400 }
      );
    }

    // Ensure user is authenticated
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Get alert and verify access
    const { data: alert, error: alertError } = await supabase
      .from("job_health_alerts")
      .select("id, job_id, workspace_id")
      .eq("id", alertId)
      .eq("job_id", jobId)
      .single();

    if (alertError || !alert) {
      return NextResponse.json(
        { error: "Alert not found" },
        { status: 404 }
      );
    }

    // Verify user has access to this workspace
    const { data: membership } = await supabase
      .from("workspace_members")
      .select("workspace_id")
      .eq("workspace_id", alert.workspace_id)
      .eq("user_id", user.id)
      .single();

    if (!membership) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    // Update alert status
    const { data: updatedAlert, error: updateError } = await supabase
      .from("job_health_alerts")
      .update({
        status: "acknowledged",
        acknowledged_at: new Date().toISOString(),
        acknowledged_by: user.id,
      })
      .eq("id", alertId)
      .select()
      .single();

    if (updateError) {
      console.error("Error updating alert:", updateError);
      return NextResponse.json(
        { error: "Failed to update alert" },
        { status: 500 }
      );
    }

    return NextResponse.json({ alert: updatedAlert });
  } catch (error: any) {
    console.error("Error in acknowledge alert:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}






































