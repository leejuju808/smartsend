// Block 25980 — Production Calendar Heatmap API
// GET /api/production-calendar/heatmap - Get production heatmap data

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";
import { getCurrentWorkspaceId } from "@/lib/workspace";

export async function GET(req: NextRequest) {
  try {
    const supabase = createClient();
    
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const workspaceId = await getCurrentWorkspaceId();
    if (!workspaceId) {
      return NextResponse.json({ error: "Workspace not found" }, { status: 404 });
    }

    const searchParams = req.nextUrl.searchParams;
    const startDate = searchParams.get("start_date") || new Date().toISOString().split("T")[0];
    const endDate = searchParams.get("end_date") || new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split("T")[0];
    const marketId = searchParams.get("market_id");

    // Update heatmap data first (this ensures data is fresh)
    const { error: updateError } = await supabase.rpc("update_production_heatmap_data", {
      p_workspace_id: workspaceId,
      p_market_id: marketId || null,
      p_start_date: startDate,
      p_end_date: endDate,
    });

    if (updateError) {
      console.error("Error updating heatmap data:", updateError);
      // Continue anyway - might be first time
    }

    // Fetch heatmap data
    let query = supabase
      .from("production_heatmap_data")
      .select("*")
      .eq("workspace_id", workspaceId)
      .gte("calendar_date", startDate)
      .lte("calendar_date", endDate)
      .order("calendar_date", { ascending: true });

    if (marketId) {
      query = query.eq("market_id", marketId);
    } else {
      query = query.is("market_id", null); // Company-wide
    }

    const { data: heatmapData, error } = await query;

    if (error) {
      console.error("Error fetching heatmap data:", error);
      return NextResponse.json(
        { error: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      heatmap: heatmapData || [],
      date_range: {
        start_date: startDate,
        end_date: endDate,
      },
      filters: {
        market_id: marketId || null,
      },
    });
  } catch (error: any) {
    console.error("Error in heatmap API:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}




































