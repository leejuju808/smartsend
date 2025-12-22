// Block 21856 — SmartSend Roofing Revenue Forecast Engine v1
// API route to fetch revenue forecast for a workspace

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getCurrentWorkspaceId } from "@/src/lib/workspace";

export async function GET(req: NextRequest) {
  try {
    const supabase = createClient();
    const { searchParams } = new URL(req.url);
    const workspaceIdParam = searchParams.get("workspace_id");

    // Get workspace ID from param or current workspace
    let workspaceId = workspaceIdParam;
    if (!workspaceId) {
      workspaceId = await getCurrentWorkspaceId();
    }

    if (!workspaceId) {
      return NextResponse.json(
        { error: "Workspace ID is required" },
        { status: 400 }
      );
    }

    // Get latest forecast for today
    const today = new Date().toISOString().split("T")[0];
    const { data: forecast, error } = await supabase
      .from("revenue_forecasts")
      .select("*")
      .eq("workspace_id", workspaceId)
      .eq("forecast_date", today)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      console.error("Error fetching revenue forecast:", error);
      return NextResponse.json(
        { error: "Failed to fetch forecast" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      forecast: forecast || null,
    });
  } catch (error: any) {
    console.error("Revenue forecast API error:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}

