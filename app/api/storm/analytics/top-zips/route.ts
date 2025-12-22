/**
 * Top ZIP Codes Hit by Storms
 * GET /api/storm/analytics/top-zips
 * Returns top ZIP codes affected by storms
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getActiveWorkspaceId } from "@/lib/workspaces/server";

/**
 * GET /api/storm/analytics/top-zips
 * Get top ZIP codes hit by storms
 * Query params: limit (default 10), days (default 30)
 */
export async function GET(req: NextRequest) {
  try {
    const supabase = createClient();
    
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const workspaceId = await getActiveWorkspaceId();
    if (!workspaceId) {
      return NextResponse.json({ error: "Workspace not found" }, { status: 404 });
    }

    const { searchParams } = new URL(req.url);
    const limit = parseInt(searchParams.get("limit") || "10");
    const days = parseInt(searchParams.get("days") || "30");

    // Get top ZIP codes from view
    const { data: topZips, error } = await supabase
      .from("storm_top_zip_codes")
      .select("*")
      .eq("workspace_id", workspaceId)
      .limit(limit);

    if (error) {
      console.error("Error fetching top ZIP codes:", error);
      return NextResponse.json(
        { error: "Failed to fetch top ZIP codes" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      top_zips: topZips || [],
    });
  } catch (error) {
    console.error("Error in /api/storm/analytics/top-zips:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}



















































