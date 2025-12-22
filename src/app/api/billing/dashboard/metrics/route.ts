// Block 240000 — SmartSend Roofing Billing & Payments Hub
// GET /api/billing/dashboard/metrics
// Get billing dashboard metrics

import { NextRequest, NextResponse } from "next/server";
import { getServerSupabase } from "@/src/lib/supabase/server";

export async function GET(req: NextRequest) {
  try {
    const supabase = await getServerSupabase();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const workspaceId = searchParams.get("workspace_id");

    if (!workspaceId) {
      return NextResponse.json(
        { error: "Missing required parameter: workspace_id" },
        { status: 400 }
      );
    }

    // Get metrics using the database function
    const { data: metrics, error } = await supabase.rpc("get_billing_dashboard_metrics", {
      p_workspace_id: workspaceId,
    });

    if (error) {
      console.error("Error fetching metrics:", error);
      return NextResponse.json(
        { error: "Failed to fetch metrics", details: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      metrics: metrics || {},
    });
  } catch (error: any) {
    console.error("Error in GET /api/billing/dashboard/metrics:", error);
    return NextResponse.json(
      { error: "Internal server error", details: error.message },
      { status: 500 }
    );
  }
}

























