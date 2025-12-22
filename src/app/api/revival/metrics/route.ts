// Block 35333 — Get Revival Metrics
// Returns revival dashboard metrics for a workspace

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(req: NextRequest) {
  try {
    const supabase = await createClient();
    const searchParams = req.nextUrl.searchParams;
    const workspaceId = searchParams.get("workspace_id");

    if (!workspaceId) {
      return NextResponse.json(
        { error: "workspace_id is required" },
        { status: 400 }
      );
    }

    // Verify user has access to workspace
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Get revival metrics from view
    const { data: metrics, error: metricsError } = await supabase
      .from("revival_metrics")
      .select("*")
      .eq("workspace_id", workspaceId)
      .single();

    // Get detailed dead leads count
    const { count: deadLeadsCount } = await supabase
      .from("leads")
      .select("*", { count: "exact", head: true })
      .eq("workspace_id", workspaceId)
      .eq("status", "dead");

    // Get high potential leads (revival score >= 60)
    const { count: highPotentialCount } = await supabase
      .from("leads")
      .select("*", { count: "exact", head: true })
      .eq("workspace_id", workspaceId)
      .eq("status", "dead")
      .gte("revival_score", 60);

    // Get revival messages sent this month
    const startOfMonth = new Date();
    startOfMonth.setDate(1);
    startOfMonth.setHours(0, 0, 0, 0);

    const { count: messagesSentCount } = await supabase
      .from("revival_sequences")
      .select("*", { count: "exact", head: true })
      .eq("workspace_id", workspaceId)
      .gte("created_at", startOfMonth.toISOString())
      .eq("status", "sent");

    // Get revival replies this month
    const { count: repliesCount } = await supabase
      .from("revival_sequences")
      .select("*", { count: "exact", head: true })
      .eq("workspace_id", workspaceId)
      .gte("created_at", startOfMonth.toISOString())
      .eq("status", "replied");

    // Calculate conversion rate
    const conversionRate =
      messagesSentCount && messagesSentCount > 0
        ? ((repliesCount || 0) / messagesSentCount) * 100
        : 0;

    return NextResponse.json({
      deadLeadsCount: deadLeadsCount || 0,
      revivedLeadsCount: metrics?.revived_leads_count || 0,
      revivedThisMonth: metrics?.revived_this_month || 0,
      highPotentialLeads: highPotentialCount || 0,
      revivalMessagesSentThisMonth: messagesSentCount || 0,
      revivalRepliesThisMonth: repliesCount || 0,
      conversionRate: Math.round(conversionRate * 10) / 10,
    });
  } catch (error: any) {
    console.error("Error fetching revival metrics:", error);
    return NextResponse.json(
      { error: "Internal server error", details: error.message },
      { status: 500 }
    );
  }
}
































