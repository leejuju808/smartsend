import { NextRequest, NextResponse } from "next/server";
import { getServerSupabase } from "@/lib/supabase/server";
import { requireWorkspace } from "@/lib/workspace/withWorkspace";

export async function GET(req: NextRequest) {
  try {
    const gate = await requireWorkspace(req);
    const { workspace_id } = gate;

    const searchParams = req.nextUrl.searchParams;
    const periodStart = searchParams.get("period_start");
    const periodEnd = searchParams.get("period_end");

    if (!periodStart || !periodEnd) {
      return NextResponse.json(
        { error: "Missing period_start or period_end" },
        { status: 400 }
      );
    }

    const supabase = getServerSupabase();

    const { data, error } = await supabase
      .from("company_scorecards")
      .select("*")
      .eq("workspace_id", workspace_id)
      .eq("period_start", periodStart)
      .eq("period_end", periodEnd)
      .order("created_at", { ascending: false })
      .limit(1)
      .single();

    if (error) {
      if (error.code === "PGRST116") {
        // No rows found
        return NextResponse.json(null, { status: 200 });
      }
      throw error;
    }

    return NextResponse.json(data);
  } catch (error: any) {
    console.error("Error fetching company scorecard:", error);
    return NextResponse.json(
      { error: error.message || "Failed to fetch scorecard" },
      { status: 500 }
    );
  }
}









































