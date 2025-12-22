// app/api/inbox/reports/top-wins/route.ts
// Block 19760 — Inbox Success Tracking & Feedback Loop v1
// API endpoint for Top Wins reports

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

    const { searchParams } = new URL(req.url);
    const week_start = searchParams.get("week_start");
    const week_end = searchParams.get("week_end");
    const workspace_id = searchParams.get("workspace_id");

    let query = supabase
      .from("inbox_top_wins_reports")
      .select("*")
      .order("week_start", { ascending: false });

    // Users can see their own reports or workspace reports
    if (workspace_id) {
      query = query.eq("workspace_id", workspace_id);
    } else {
      // Default to user's reports
      query = query.eq("user_id", user.id);
    }

    if (week_start) {
      query = query.gte("week_start", week_start);
    }

    if (week_end) {
      query = query.lte("week_end", week_end);
    }

    const { data, error } = await query.limit(10); // Last 10 reports

    if (error) {
      console.error("Error fetching top wins reports:", error);
      return NextResponse.json(
        { error: error.message || "Failed to fetch reports" },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true, data });
  } catch (error: any) {
    console.error("Error fetching top wins reports:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}



















































