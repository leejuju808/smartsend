/**
 * GET /api/geo/recommendations
 * Block 18000 — Get AI geographic recommendations
 * Returns top ZIPs to target, top neighborhoods for follow-ups, etc.
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
    const recommendationType = searchParams.get("type") || "all"; // all, top_zips, top_neighborhoods, insurance_rich, aging_roofs

    const recommendations: any = {};

    // Top 3 ZIPs to target this week (based on storm + performance)
    if (recommendationType === "all" || recommendationType === "top_zips") {
      const { data: topZips } = await supabase
        .from("geo_zip_data")
        .select("*")
        .eq("workspace_id", workspaceId)
        .order("zip_rank_score", { ascending: false, nullsLast: true })
        .limit(3);

      recommendations.topZips = topZips || [];
    }

    // Top neighborhoods to focus follow-ups (based on reply patterns)
    if (recommendationType === "all" || recommendationType === "top_neighborhoods") {
      const { data: topNeighborhoods } = await supabase
        .from("geo_neighborhood_data")
        .select("*")
        .eq("workspace_id", workspaceId)
        .gt("reply_rate_pct", 0)
        .order("reply_rate_pct", { ascending: false })
        .limit(5);

      recommendations.topNeighborhoods = topNeighborhoods || [];
    }

    // ZIPs with high insurance probability
    if (recommendationType === "all" || recommendationType === "insurance_rich") {
      const { data: insuranceRichZips } = await supabase
        .from("geo_zip_data")
        .select("*")
        .eq("workspace_id", workspaceId)
        .gte("insurance_rich_score", 70)
        .order("insurance_rich_score", { ascending: false })
        .limit(5);

      recommendations.insuranceRichZips = insuranceRichZips || [];
    }

    // Neighborhoods with aging roofs
    if (recommendationType === "all" || recommendationType === "aging_roofs") {
      const { data: agingRoofNeighborhoods } = await supabase
        .from("geo_neighborhood_data")
        .select("*")
        .eq("workspace_id", workspaceId)
        .gte("avg_roof_age", 16)
        .order("avg_roof_age", { ascending: false })
        .limit(5);

      recommendations.agingRoofNeighborhoods = agingRoofNeighborhoods || [];
    }

    // Storm opportunity zones (Red and Orange)
    if (recommendationType === "all" || recommendationType === "storm_zones") {
      const { data: stormZones } = await supabase
        .from("geo_storm_zones")
        .select("*")
        .eq("workspace_id", workspaceId)
        .in("zone_color", ["red", "orange"])
        .gt("zone_expires_at", new Date().toISOString())
        .order("priority_level", { ascending: false })
        .limit(10);

      recommendations.stormZones = stormZones || [];
    }

    return NextResponse.json({
      success: true,
      recommendations,
    });
  } catch (error: any) {
    console.error("Error in GET /api/geo/recommendations:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}





















































