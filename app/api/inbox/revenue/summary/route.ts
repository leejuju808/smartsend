// Block 20070 — Revenue Summary API

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

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

    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0);

    const { data, error } = await supabase
      .from("inbox_threads")
      .select("actual_job_value")
      .eq("lead_stage", "won")
      .gte("close_date", monthStart.toISOString().slice(0, 10))
      .lte("close_date", monthEnd.toISOString().slice(0, 10));

    if (error) {
      console.error("Revenue summary error", error);
      return NextResponse.json(
        { error: "Failed to load revenue summary" },
        { status: 500 }
      );
    }

    const total = (data || [])
      .map((r) => r.actual_job_value || 0)
      .reduce((acc, v) => acc + v, 0);

    return NextResponse.json({ month_total: total });
  } catch (error: any) {
    console.error("Error in /api/inbox/revenue/summary:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}

















































