import { NextRequest, NextResponse } from "next/server";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";

export async function GET(req: NextRequest) {
  try {
    const supabase = createRouteHandlerClient({ cookies });
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Call the RPC function to get aggregated performance metrics
    const { data: performance, error } = await supabase.rpc("get_marketing_performance");

    if (error) {
      console.error("Error fetching marketing performance:", error);
      return NextResponse.json({ error: "Failed to fetch performance data" }, { status: 500 });
    }

    return NextResponse.json({ performance: performance || [] });
  } catch (error) {
    console.error("Error in GET /api/marketing/performance:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

