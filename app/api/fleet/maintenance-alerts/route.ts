// Block 70000 — SmartSend Roofing Equipment Tracking + Fleet Maintenance System v1
// API Route: Get Fleet Maintenance Alerts
// GET /api/fleet/maintenance-alerts

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

    // Get workspace_id
    const { data: workspaceMember } = await supabase
      .from("workspace_members")
      .select("workspace_id")
      .eq("user_id", user.id)
      .limit(1)
      .single();

    if (!workspaceMember) {
      return NextResponse.json(
        { error: "No workspace found" },
        { status: 404 }
      );
    }

    const { searchParams } = new URL(req.url);
    const days_ahead = parseInt(searchParams.get("days_ahead") || "30");

    // Call the database function
    const { data: alerts, error: alertsError } = await supabase.rpc(
      "get_maintenance_alerts",
      {
        p_workspace_id: workspaceMember.workspace_id,
        p_days_ahead: days_ahead,
      }
    );

    if (alertsError) {
      console.error("Error getting maintenance alerts:", alertsError);
      return NextResponse.json(
        { error: alertsError.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      alerts: alerts || [],
    });
  } catch (error: any) {
    console.error("Error in maintenance alerts API:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}




























