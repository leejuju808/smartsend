// Block 26540 — SmartSend Roofing Lead Score & Heat Ranking v1
// API Route: GET /api/lead-priority
// Returns the sales priority queue with leads ranked by closability

import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { getCurrentWorkspaceId } from "@/lib/workspace";

export async function GET(req: NextRequest) {
  try {
    const supabase = createRouteHandlerClient({ cookies });

    // Authentication check
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Get workspace_id
    const workspaceId = await getCurrentWorkspaceId();
    if (!workspaceId) {
      return NextResponse.json({ error: "Workspace not found" }, { status: 400 });
    }

    // Parse query parameters
    const url = new URL(req.url);
    const heatLevel = url.searchParams.get("heat_level"); // Filter by heat level: hot, warm, cold, noise
    const limit = Math.min(200, Math.max(1, Number(url.searchParams.get("limit") ?? 50)));
    const offset = Math.max(0, Number(url.searchParams.get("offset") ?? 0));

    // Query the priority queue view
    let query = supabase
      .from("roofing_lead_priority_queue")
      .select("*", { count: "exact" })
      .eq("workspace_id", workspaceId)
      .order("total_score", { ascending: false })
      .order("last_reply_at", { ascending: false, nullsLast: true })
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);

    // Apply heat level filter if provided
    if (heatLevel && ["hot", "warm", "cold", "noise"].includes(heatLevel)) {
      query = query.eq("heat_level", heatLevel);
    }

    const { data: queue, error, count } = await query;

    if (error) {
      console.error("Error fetching lead priority queue:", error);
      return NextResponse.json(
        { error: "Failed to fetch lead priority queue", details: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      queue: queue || [],
      pagination: {
        limit,
        offset,
        total: count || 0,
        has_more: (count || 0) > offset + limit,
      },
    });
  } catch (error: any) {
    console.error("Error in lead-priority route:", error);
    return NextResponse.json(
      { error: "Internal server error", details: error.message },
      { status: 500 }
    );
  }
}
