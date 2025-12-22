// Block 246000 — Create Production Issue API
// POST /api/production/issue/create

import { NextRequest, NextResponse } from "next/server";
import { getServerSupabase } from "@/lib/supabase/server";
import { getActiveWorkspaceId } from "@/lib/workspace/context";

export async function POST(req: NextRequest) {
  try {
    const supabase = getServerSupabase();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const workspaceId = await getActiveWorkspaceId();
    if (!workspaceId) {
      return NextResponse.json({ error: "No workspace found" }, { status: 400 });
    }

    const {
      job_id,
      crew_id,
      type,
      severity,
      message,
      metadata,
    } = await req.json();

    if (!type || !severity || !message) {
      return NextResponse.json(
        { error: "type, severity, and message are required" },
        { status: 400 }
      );
    }

    // Validate type
    const validTypes = [
      "delay",
      "weather",
      "material_shortage",
      "cost_risk",
      "safety_risk",
      "crew_issue",
      "scheduling_conflict",
      "customer_communication",
      "equipment_unavailable",
      "profitability_risk",
      "change_order_pending",
      "inspection_required",
      "payment_issue",
      "other",
    ];
    if (!validTypes.includes(type)) {
      return NextResponse.json(
        { error: `Invalid type. Must be one of: ${validTypes.join(", ")}` },
        { status: 400 }
      );
    }

    // Validate severity
    const validSeverities = ["info", "warning", "critical"];
    if (!validSeverities.includes(severity)) {
      return NextResponse.json(
        { error: `Invalid severity. Must be one of: ${validSeverities.join(", ")}` },
        { status: 400 }
      );
    }

    // Create alert
    const { data: alert, error: alertError } = await supabase
      .from("job_alerts")
      .insert({
        workspace_id: workspaceId,
        job_id: job_id || null,
        crew_id: crew_id || null,
        type,
        severity,
        message,
        metadata: metadata || {},
      })
      .select()
      .single();

    if (alertError) {
      console.error("Error creating alert:", alertError);
      return NextResponse.json({ error: alertError.message }, { status: 500 });
    }

    // Log production event
    await supabase.from("production_events").insert({
      workspace_id: workspaceId,
      job_id: job_id || null,
      crew_id: crew_id || null,
      user_id: user.id,
      event_type: "issue_reported",
      message: `Issue reported: ${message}`,
      details: { alert_id: alert.id, type, severity, metadata },
    });

    return NextResponse.json({ success: true, alert });
  } catch (error: any) {
    console.error("Error in POST /api/production/issue/create:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}

























