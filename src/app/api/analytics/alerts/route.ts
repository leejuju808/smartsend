import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * GET /api/analytics/alerts
 * Returns analytics-based alerts for the workspace
 * 
 * POST /api/analytics/alerts
 * Creates a new analytics alert
 */
export async function GET(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { searchParams } = new URL(req.url);
    const workspaceId = searchParams.get("workspaceId");
    const unreadOnly = searchParams.get("unreadOnly") === "true";

    if (!workspaceId) {
      return NextResponse.json(
        { error: "workspaceId is required" },
        { status: 400 }
      );
    }

    let query = supabase
      .from("analytics_alerts")
      .select("*")
      .eq("workspace_id", workspaceId)
      .eq("is_dismissed", false)
      .order("created_at", { ascending: false })
      .limit(50);

    if (unreadOnly) {
      query = query.eq("is_read", false);
    }

    const { data: alerts, error } = await query;

    if (error) throw error;

    return NextResponse.json({ alerts: alerts || [] });
  } catch (error) {
    console.error("Error fetching analytics alerts:", error);
    return NextResponse.json(
      { error: "Failed to fetch analytics alerts" },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    const body = await req.json();
    const {
      workspaceId,
      alertType,
      alertTitle,
      alertMessage,
      alertSeverity = "medium",
      metricName,
      metricValue,
      metricThreshold,
      metricChangePct,
    } = body;

    if (!workspaceId || !alertType || !alertTitle || !alertMessage) {
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400 }
      );
    }

    const { data: alert, error } = await supabase.rpc("create_analytics_alert", {
      p_workspace_id: workspaceId,
      p_alert_type: alertType,
      p_alert_title: alertTitle,
      p_alert_message: alertMessage,
      p_alert_severity: alertSeverity,
      p_metric_name: metricName,
      p_metric_value: metricValue,
      p_metric_threshold: metricThreshold,
      p_metric_change_pct: metricChangePct,
    });

    if (error) throw error;

    return NextResponse.json({ alert });
  } catch (error) {
    console.error("Error creating analytics alert:", error);
    return NextResponse.json(
      { error: "Failed to create analytics alert" },
      { status: 500 }
    );
  }
}

/**
 * PATCH /api/analytics/alerts/[id]
 * Update alert (mark as read, dismiss, etc.)
 */
export async function PATCH(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { searchParams } = new URL(req.url);
    const alertId = searchParams.get("id");
    const body = await req.json();
    const { isRead, isDismissed, acknowledgedAt } = body;

    if (!alertId) {
      return NextResponse.json(
        { error: "Alert ID is required" },
        { status: 400 }
      );
    }

    const updateData: any = {};
    if (isRead !== undefined) updateData.is_read = isRead;
    if (isDismissed !== undefined) updateData.is_dismissed = isDismissed;
    if (acknowledgedAt !== undefined)
      updateData.acknowledged_at = acknowledgedAt;

    const { data: alert, error } = await supabase
      .from("analytics_alerts")
      .update(updateData)
      .eq("id", alertId)
      .select()
      .single();

    if (error) throw error;

    return NextResponse.json({ alert });
  } catch (error) {
    console.error("Error updating analytics alert:", error);
    return NextResponse.json(
      { error: "Failed to update analytics alert" },
      { status: 500 }
    );
  }
}




































