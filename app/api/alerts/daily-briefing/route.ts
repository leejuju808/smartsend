// Block 25620 — SmartSend Roofing Alerts Intelligence v1
// API Route: Get Owner Daily Briefing
// GET /api/alerts/daily-briefing

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(req: NextRequest) {
  try {
    const supabase = createClient();
    const { searchParams } = new URL(req.url);
    const briefingDate = searchParams.get("date") || new Date().toISOString().split("T")[0];

    // Ensure user is authenticated
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Get user's workspace
    const { data: workspace, error: workspaceError } = await supabase
      .from("workspace_members")
      .select("workspace_id")
      .eq("user_id", user.id)
      .single();

    if (workspaceError || !workspace) {
      return NextResponse.json(
        { error: "Workspace not found" },
        { status: 404 }
      );
    }

    // Generate daily briefing
    const { data: briefingId, error: briefingError } = await supabase.rpc(
      "generate_owner_daily_briefing",
      {
        p_workspace_id: workspace.workspace_id,
        p_briefing_date: briefingDate,
      }
    );

    if (briefingError) {
      console.error("Error generating briefing:", briefingError);
      return NextResponse.json(
        { error: "Failed to generate briefing", details: briefingError.message },
        { status: 500 }
      );
    }

    // Get the notification that was created
    const { data: notification, error: notificationError } = await supabase
      .from("notifications")
      .select("*")
      .eq("id", briefingId)
      .single();

    if (notificationError || !notification) {
      return NextResponse.json(
        { error: "Briefing notification not found" },
        { status: 404 }
      );
    }

    return NextResponse.json({
      ok: true,
      briefing: {
        id: notification.id,
        title: notification.title,
        body: notification.body,
        payload: notification.payload,
        created_at: notification.created_at,
      },
    });
  } catch (error: any) {
    console.error("Error in GET /api/alerts/daily-briefing:", error);
    return NextResponse.json(
      { error: "Internal server error", details: error.message },
      { status: 500 }
    );
  }
}




































