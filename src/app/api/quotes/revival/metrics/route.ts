// Block 28844 — Quote Revival Engine API
// GET /api/quotes/revival/metrics - Get revival metrics for workspace

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";

export async function GET(req: NextRequest) {
  try {
    const cookieStore = await cookies();
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    // Get authenticated user
    const { data: { user }, error: authError } = await supabase.auth.getUser(
      cookieStore.get("sb-access-token")?.value || ""
    );

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Get workspace_id from query params or user's active workspace
    const { searchParams } = new URL(req.url);
    const workspaceId = searchParams.get("workspace_id");

    if (!workspaceId) {
      // Try to get user's active workspace
      const { data: memberships } = await supabase
        .from("workspace_members")
        .select("workspace_id")
        .eq("user_id", user.id)
        .limit(1)
        .single();

      if (!memberships) {
        return NextResponse.json({ error: "No workspace found" }, { status: 404 });
      }

      const { data: metrics } = await supabase.rpc("get_revival_metrics", {
        p_workspace_id: memberships.workspace_id,
      });

      return NextResponse.json(metrics || {
        stalled_quotes_count: 0,
        revived_quotes_count: 0,
        revenue_recovered: 0,
        discounts_offered: 0,
        discounts_accepted: 0,
        jobs_won_after_revival: 0,
      });
    }

    // Verify user has access to workspace
    const { data: membership } = await supabase
      .from("workspace_members")
      .select("workspace_id")
      .eq("workspace_id", workspaceId)
      .eq("user_id", user.id)
      .single();

    if (!membership) {
      return NextResponse.json({ error: "Access denied" }, { status: 403 });
    }

    // Get metrics
    const { data: metrics, error: metricsError } = await supabase.rpc("get_revival_metrics", {
      p_workspace_id: workspaceId,
    });

    if (metricsError) {
      console.error("Error fetching revival metrics:", metricsError);
      return NextResponse.json({ error: metricsError.message }, { status: 500 });
    }

    return NextResponse.json(metrics || {
      stalled_quotes_count: 0,
      revived_quotes_count: 0,
      revenue_recovered: 0,
      discounts_offered: 0,
      discounts_accepted: 0,
      jobs_won_after_revival: 0,
    });
  } catch (error: any) {
    console.error("Unexpected error:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}


































