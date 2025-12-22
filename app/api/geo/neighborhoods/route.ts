/**
 * GET /api/geo/neighborhoods
 * Block 18000 — Get neighborhood intelligence data
 * Returns neighborhood-level intelligence with roof age, home value, storm risk, and performance
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
    const zip = searchParams.get("zip");
    const limit = parseInt(searchParams.get("limit") || "100");
    const sortBy = searchParams.get("sortBy") || "neighborhood_score"; // neighborhood_score, avg_home_value, reply_rate_pct
    const order = searchParams.get("order") || "desc";

    // Build query
    let query = supabase
      .from("geo_neighborhood_data")
      .select("*")
      .eq("workspace_id", workspaceId);

    // Filter by ZIP if provided
    if (zip) {
      query = query.eq("zip", zip);
    }

    // Apply sorting
    if (sortBy === "neighborhood_rank") {
      query = query.order("neighborhood_rank", { ascending: order === "asc", nullsLast: true });
    } else {
      query = query.order(sortBy as any, { ascending: order === "asc", nullsLast: true });
    }

    // Apply limit
    query = query.limit(limit);

    const { data: neighborhoodData, error } = await query;

    if (error) {
      console.error("Error fetching neighborhood data:", error);
      return NextResponse.json(
        { error: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      neighborhoods: neighborhoodData || [],
      count: neighborhoodData?.length || 0,
    });
  } catch (error: any) {
    console.error("Error in GET /api/geo/neighborhoods:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}





















































