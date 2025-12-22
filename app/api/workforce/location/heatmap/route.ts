// Block 253500 — Jobsite Live View Engine
// GET /api/workforce/location/heatmap
// Returns job location heatmap data

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(req: NextRequest) {
  try {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const searchParams = req.nextUrl.searchParams;
    const company_id = searchParams.get("company_id");
    const start_date = searchParams.get("start_date");
    const end_date = searchParams.get("end_date");

    if (!company_id) {
      return NextResponse.json(
        { error: "company_id is required" },
        { status: 400 }
      );
    }

    // Get heatmap data
    const { data: heatmapData, error: heatmapError } = await supabase.rpc(
      "get_job_heatmap_data",
      {
        p_company_id: company_id,
        p_start_date: start_date || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split("T")[0],
        p_end_date: end_date || new Date().toISOString().split("T")[0],
      }
    );

    if (heatmapError) {
      console.error("Error fetching heatmap data:", heatmapError);
      return NextResponse.json(
        { error: "Failed to fetch heatmap data" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      heatmap: heatmapData || [],
    });
  } catch (error: any) {
    console.error("Error in heatmap fetch:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}
























