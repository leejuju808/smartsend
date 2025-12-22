// Block 25620 — SmartSend Roofing Alerts Intelligence v1
// API Route: Mark Alert Action Taken
// POST /api/alerts/action

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST(req: NextRequest) {
  try {
    const supabase = createClient();
    const body = await req.json();
    const { alert_id, action_taken } = body;

    if (!alert_id) {
      return NextResponse.json(
        { error: "alert_id is required" },
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

    // Get alert to verify ownership
    const { data: alert, error: alertError } = await supabase
      .from("notifications")
      .select("id, user_id, requires_action")
      .eq("id", alert_id)
      .single();

    if (alertError || !alert) {
      return NextResponse.json(
        { error: "Alert not found" },
        { status: 404 }
      );
    }

    // Verify user owns this alert
    if (alert.user_id !== user.id) {
      return NextResponse.json({ error: "Access denied" }, { status: 403 });
    }

    // Update alert
    const updateData: any = {
      action_taken: action_taken !== false, // Default to true if not specified
      updated_at: new Date().toISOString(),
    };

    if (action_taken !== false) {
      updateData.action_taken_at = new Date().toISOString();
      updateData.action_taken_by = user.id;
    } else {
      updateData.action_taken_at = null;
      updateData.action_taken_by = null;
    }

    const { data: updatedAlert, error: updateError } = await supabase
      .from("notifications")
      .update(updateData)
      .eq("id", alert_id)
      .select()
      .single();

    if (updateError) {
      console.error("Error updating alert:", updateError);
      return NextResponse.json(
        { error: "Failed to update alert", details: updateError.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      ok: true,
      alert: updatedAlert,
    });
  } catch (error: any) {
    console.error("Error in POST /api/alerts/action:", error);
    return NextResponse.json(
      { error: "Internal server error", details: error.message },
      { status: 500 }
    );
  }
}




































