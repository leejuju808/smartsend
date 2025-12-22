// Block 80000 — SmartSend Roofing
// "Job Value Predictor + Profit Probability AI" v1
// API Route: Get ZIP Code Statistics

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(req: NextRequest) {
  try {
    const supabase = await createClient();
    const searchParams = req.nextUrl.searchParams;
    const workspaceId = searchParams.get("workspace_id");

    if (!workspaceId) {
      return NextResponse.json(
        { error: "Missing required field: workspace_id" },
        { status: 400 }
      );
    }

    // Call the database function
    const { data, error } = await supabase.rpc("get_top_profit_zipcodes", {
      p_workspace_id: workspaceId,
      p_limit: 10,
    });

    if (error) {
      console.error("Error fetching ZIP code stats:", error);
      return NextResponse.json(
        { error: "Failed to fetch ZIP code statistics" },
        { status: 500 }
      );
    }

    return NextResponse.json({ stats: data || [] });
  } catch (error: any) {
    console.error("Error in zipcode-stats route:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}



























