import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const workspaceId = searchParams.get("workspace_id");
    const daysAhead = parseInt(searchParams.get("days_ahead") || "14");
    const globalDaysAhead = parseInt(searchParams.get("global_days_ahead") || "30");

    if (!workspaceId) {
      return NextResponse.json(
        { error: "workspace_id is required" },
        { status: 400 }
      );
    }

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    // Get capacity by crew (next 14 days)
    const { data: byCrew, error: crewError } = await supabase
      .from("roofing_daily_capacity")
      .select("*")
      .eq("workspace_id", workspaceId)
      .gte("work_date", new Date().toISOString().split("T")[0])
      .lte(
        "work_date",
        new Date(Date.now() + daysAhead * 86400000).toISOString().split("T")[0]
      )
      .order("crew_id", { ascending: true })
      .order("work_date", { ascending: true });

    if (crewError) {
      console.error("Error fetching crew capacity:", crewError);
      return NextResponse.json(
        { error: "Failed to fetch crew capacity", details: crewError.message },
        { status: 500 }
      );
    }

    // Get global capacity (next 30 days)
    const { data: global, error: globalError } = await supabase
      .from("roofing_global_daily_capacity")
      .select("*")
      .eq("workspace_id", workspaceId)
      .gte("work_date", new Date().toISOString().split("T")[0])
      .lte(
        "work_date",
        new Date(Date.now() + globalDaysAhead * 86400000)
          .toISOString()
          .split("T")[0]
      )
      .order("work_date", { ascending: true });

    if (globalError) {
      console.error("Error fetching global capacity:", globalError);
      return NextResponse.json(
        { error: "Failed to fetch global capacity", details: globalError.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      byCrew: byCrew || [],
      global: global || [],
    });
  } catch (error: any) {
    console.error("Error in daily-capacity:", error);
    return NextResponse.json(
      { error: "Internal server error", details: error.message },
      { status: 500 }
    );
  }
}



































