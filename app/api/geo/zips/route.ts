/**
 * GET /api/geo/zips
 * Block 18000 — Get ZIP code intelligence data
 * Returns ranked ZIP codes with storm, home value, roof age, and performance metrics
 */

import { NextRequest, NextResponse } from "next/server";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";
import { getActiveWorkspaceId } from "@/lib/workspaces/server";

export async function GET(req: NextRequest) {
  try {
    const supabase = createRouteHandlerClient({ cookies });
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const workspaceId = await getActiveWorkspaceId();
    if (!workspaceId) {
      return NextResponse.json(
        { error: "Workspace not found" },
        { status: 404 }
      );
    }

    const { searchParams } = new URL(req.url);
    const limit = parseInt(searchParams.get("limit") || "100");
    const sortBy = searchParams.get("sortBy") || "zip_rank_score"; // zip_rank_score, storm_severity_score, avg_home_value, reply_rate_pct
    const order = searchParams.get("order") || "desc";

    // Build query
    let query = supabase
      .from("geo_zip_data")
      .select("*")
      .eq("workspace_id", workspaceId);

    // Apply sorting
    if (sortBy === "zip_rank") {
      query = query.order("zip_rank", { ascending: order === "asc", nullsLast: true });
    } else {
      query = query.order(sortBy as any, { ascending: order === "asc", nullsLast: true });
    }

    // Apply limit
    query = query.limit(limit);

    const { data: zipData, error } = await query;

    if (error) {
      console.error("Error fetching ZIP data:", error);
      return NextResponse.json(
        { error: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      zips: zipData || [],
      count: zipData?.length || 0,
    });
  } catch (error: any) {
    console.error("Error in GET /api/geo/zips:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}





















































