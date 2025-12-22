// Block 72000 — Service Area Stats API
// GET: Get performance stats by ZIP code for service areas

import { NextRequest, NextResponse } from "next/server";
import { getServerSupabase } from "@/lib/supabase/server";
import { requireWorkspace } from "@/lib/workspace/withWorkspace";

export async function GET(req: NextRequest) {
  try {
    const gate = await requireWorkspace(req);
    if ("error" in gate) return gate.error;

    const { workspace_id } = gate;
    const supabase = getServerSupabase();

    const url = new URL(req.url);
    const zipcode = url.searchParams.get("zipcode");
    const area_id = url.searchParams.get("area_id");

    let query = supabase
      .from("service_area_stats")
      .select("*")
      .eq("workspace_id", workspace_id)
      .order("performance_score", { ascending: false });

    if (zipcode) {
      query = query.eq("zipcode", zipcode);
    }

    if (area_id) {
      query = query.eq("area_id", area_id);
    }

    const { data: stats, error } = await query;

    if (error) {
      console.error("Error fetching service area stats:", error);
      return NextResponse.json(
        { error: "Failed to fetch stats" },
        { status: 500 }
      );
    }

    return NextResponse.json({ stats: stats || [] });
  } catch (error) {
    console.error("Error in GET /api/service-areas/stats:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}



























