// Block 22600 — SmartSend Roofing Job Forecasting & Variance Alerts v1
// API Route: Variance Alerts Dashboard Data
// GET /api/dashboard/variance-alerts

import { NextRequest, NextResponse } from "next/server";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";

export async function GET(req: NextRequest) {
  try {
    const supabase = createRouteHandlerClient({ cookies });

    // Ensure user is authenticated
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Get user's workspaces
    const { data: memberships } = await supabase
      .from("workspace_members")
      .select("workspace_id")
      .eq("user_id", user.id);

    if (!memberships || memberships.length === 0) {
      return NextResponse.json({
        alerts: [],
      });
    }

    const workspaceIds = memberships.map((m) => m.workspace_id);

    // Get open variance alerts with job info
    const { data: alerts, error: alertsError } = await supabase
      .from("job_variance_alerts")
      .select(
        `
        id,
        job_id,
        type,
        severity,
        message,
        created_at,
        job:roofing_jobs!job_variance_alerts_job_id_fkey(
          id,
          title,
          lead:leads(first_name, last_name, email)
        )
      `
      )
      .in("workspace_id", workspaceIds)
      .eq("status", "open")
      .order("created_at", { ascending: false })
      .limit(10);

    if (alertsError) {
      console.error("Error fetching variance alerts:", alertsError);
      return NextResponse.json(
        { error: "Failed to fetch variance alerts", details: alertsError.message },
        { status: 500 }
      );
    }

    // Format alerts with job info
    const formattedAlerts = (alerts || []).map((alert: any) => {
      const job = alert.job;
      const lead = job?.lead;
      const homeownerName = lead
        ? `${lead.first_name || ""} ${lead.last_name || ""}`.trim() || undefined
        : undefined;

      return {
        id: alert.id,
        job_id: alert.job_id,
        type: alert.type,
        severity: alert.severity,
        message: alert.message,
        created_at: alert.created_at,
        job: {
          id: job?.id,
          title: job?.title || homeownerName || "Unknown Job",
          homeowner_name: homeownerName,
          homeowner_email: lead?.email,
        },
      };
    });

    return NextResponse.json({
      alerts: formattedAlerts,
    });
  } catch (error: any) {
    console.error("Error in GET /api/dashboard/variance-alerts:", error);
    return NextResponse.json(
      { error: "Internal server error", details: error.message },
      { status: 500 }
    );
  }
}







































