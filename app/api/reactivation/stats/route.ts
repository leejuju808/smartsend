// Block 28412 — SmartSend Roofing Past Customer Reactivation Engine v1
// API Route: Get Reactivation Stats
// GET /api/reactivation/stats?workspace_id=xxx

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(req: NextRequest) {
  try {
    const supabase = createClient();

    // Ensure user is authenticated
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

    const { searchParams } = new URL(req.url);
    const workspace_id = searchParams.get("workspace_id");

    if (!workspace_id) {
      return NextResponse.json(
        { error: "workspace_id required" },
        { status: 400 }
      );
    }

    // Verify user has access to this workspace
    const { data: membership } = await supabase
      .from("workspace_members")
      .select("workspace_id")
      .eq("workspace_id", workspace_id)
      .eq("user_id", user.id)
      .single();

    if (!membership) {
      return NextResponse.json(
        { error: "Access denied" },
        { status: 403 }
      );
    }

    // Get reactivation stats
    const { data: stats, error: statsError } = await supabase.rpc(
      "get_reactivation_stats",
      { p_workspace_id: workspace_id }
    );

    if (statsError) {
      console.error("Error getting reactivation stats:", statsError);
      return NextResponse.json(
        { error: "Failed to get reactivation stats" },
        { status: 500 }
      );
    }

    const result = Array.isArray(stats) && stats.length > 0 ? stats[0] : {
      past_customers_count: 0,
      events_scheduled: 0,
      events_sent: 0,
      events_replied: 0,
      events_booked: 0,
      estimated_revenue: 0,
    };

    return NextResponse.json({
      past_customers_count: Number(result.past_customers_count || 0),
      events_scheduled: Number(result.events_scheduled || 0),
      events_sent: Number(result.events_sent || 0),
      events_replied: Number(result.events_replied || 0),
      events_booked: Number(result.events_booked || 0),
      estimated_revenue: Number(result.estimated_revenue || 0),
    });
  } catch (error) {
    console.error("Error in reactivation stats API:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}


































