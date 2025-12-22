// Block 21812 — SmartSend Roofing Estimator Coaching Engine v1
// API route to fetch coaching reports

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
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const estimator_id = searchParams.get("estimator_id");
    const workspace_id = searchParams.get("workspace_id");
    const week_start = searchParams.get("week_start");
    const week_end = searchParams.get("week_end");
    const report_type = searchParams.get("report_type") as "daily" | "weekly" | null;

    if (!estimator_id || !workspace_id) {
      return NextResponse.json(
        { error: "Missing required fields: estimator_id, workspace_id" },
        { status: 400 }
      );
    }

    // Verify user is a member of this workspace
    const { data: membership } = await supabase
      .from("workspace_members")
      .select("workspace_id")
      .eq("workspace_id", workspace_id)
      .eq("user_id", user.id)
      .single();

    if (!membership) {
      return NextResponse.json(
        { error: "Not a member of this workspace" },
        { status: 403 }
      );
    }

    // Build query
    let query = supabase
      .from("estimator_coaching_reports")
      .select("*")
      .eq("estimator_id", estimator_id)
      .eq("workspace_id", workspace_id)
      .order("week_end", { ascending: false });

    if (report_type) {
      query = query.eq("report_type", report_type);
    }

    if (week_start && week_end) {
      query = query.eq("week_start", week_start).eq("week_end", week_end);
    } else if (report_type) {
      // If report_type specified but no dates, get latest report of that type
      query = query.limit(1);
    }

    const { data, error } = await query;

    if (error) {
      console.error("Error fetching coaching reports:", error);
      return NextResponse.json(
        { error: error.message || "Failed to fetch coaching reports" },
        { status: 500 }
      );
    }

    // If specific week requested and no data, return null
    if (week_start && week_end && (!data || data.length === 0)) {
      return NextResponse.json({ coachingReport: null });
    }

    // Return single report if specific week, or array if all reports
    if (week_start && week_end) {
      return NextResponse.json({ coachingReport: data?.[0] || null });
    }

    return NextResponse.json({ coachingReports: data || [] });
  } catch (error: any) {
    console.error("Error in /api/estimators/coaching:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}

