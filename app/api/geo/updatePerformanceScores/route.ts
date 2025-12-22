/**
 * POST /api/geo/updatePerformanceScores
 * Block 18000 — Update geographic performance scores
 * Worker function to calculate performance scores by ZIP and neighborhood
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

export async function POST(req: NextRequest) {
  try {
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Get workspace_id from request body or query params
    const body = await req.json().catch(() => ({}));
    const workspaceId = body.workspace_id || req.nextUrl.searchParams.get("workspace_id");
    const periodDays = parseInt(body.period_days || req.nextUrl.searchParams.get("period_days") || "30");

    if (!workspaceId) {
      return NextResponse.json(
        { error: "workspace_id is required" },
        { status: 400 }
      );
    }

    const periodStart = new Date(Date.now() - periodDays * 24 * 60 * 60 * 1000);
    const periodEnd = new Date();

    // Call the database function to calculate performance scores
    const { error } = await supabase.rpc("calculate_geo_performance_scores", {
      p_workspace_id: workspaceId,
      p_period_start: periodStart.toISOString(),
      p_period_end: periodEnd.toISOString(),
    });

    if (error) {
      console.error("Error calculating performance scores:", error);
      return NextResponse.json(
        { error: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      message: "Performance scores calculated successfully",
      workspace_id: workspaceId,
      period_start: periodStart.toISOString(),
      period_end: periodEnd.toISOString(),
    });
  } catch (error: any) {
    console.error("Error in POST /api/geo/updatePerformanceScores:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}





















































