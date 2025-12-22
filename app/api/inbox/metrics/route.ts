// app/api/inbox/metrics/route.ts
// Block 19760 — Inbox Success Tracking & Feedback Loop v1
// API endpoint for retrieving success metrics

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
    const period_type = searchParams.get("period_type") || "weekly"; // weekly or monthly
    const period_start = searchParams.get("period_start");
    const period_end = searchParams.get("period_end");
    const campaign_id = searchParams.get("campaign_id");
    const workspace_id = searchParams.get("workspace_id");

    let query = supabase
      .from("inbox_success_metrics")
      .select("*")
      .eq("user_id", user.id)
      .eq("period_type", period_type)
      .order("period_start", { ascending: false });

    if (period_start) {
      query = query.gte("period_start", period_start);
    }

    if (period_end) {
      query = query.lte("period_end", period_end);
    }

    if (campaign_id) {
      query = query.eq("campaign_id", campaign_id);
    }

    if (workspace_id) {
      query = query.eq("workspace_id", workspace_id);
    }

    const { data, error } = await query;

    if (error) {
      console.error("Error fetching metrics:", error);
      return NextResponse.json(
        { error: error.message || "Failed to fetch metrics" },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true, data });
  } catch (error: any) {
    console.error("Error fetching metrics:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}



















































