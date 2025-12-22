// Block 24220 — SmartSend Quote Follow-Up Dashboard API
// Returns dashboard metrics for quote follow-up engine

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
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Get workspace_id from query params or user's default workspace
    const { searchParams } = new URL(req.url);
    const workspaceId = searchParams.get("workspace_id");

    if (!workspaceId) {
      return NextResponse.json(
        { error: "workspace_id required" },
        { status: 400 }
      );
    }

    // Get dashboard data
    const { data: dashboard, error: dashboardError } = await supabase
      .from("quote_followup_dashboard")
      .select("*")
      .eq("workspace_id", workspaceId)
      .single();

    if (dashboardError && dashboardError.code !== "PGRST116") {
      console.error("Dashboard error:", dashboardError);
      return NextResponse.json(
        { error: "Failed to fetch dashboard data" },
        { status: 500 }
      );
    }

    // If no dashboard data, return zeros
    const result = dashboard || {
      workspace_id: workspaceId,
      active_quotes: 0,
      hot_leads: 0,
      waiting_on_insurance: 0,
      due_today: 0,
      due_soon: 0,
    };

    return NextResponse.json({
      success: true,
      data: result,
    });
  } catch (error: any) {
    console.error("Dashboard API error:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}






































