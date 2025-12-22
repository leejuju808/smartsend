// Block 38390 — SmartSend Roofing Production Capacity Report API
// GET /api/production/capacity-report?week_start=YYYY-MM-DD&workspace_id=uuid
// Returns weekly capacity report showing squares scheduled, crew availability, overload risk, etc.

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(req: NextRequest) {
  try {
    const supabase = createClient();

    // Ensure user is authenticated
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    // Get user's workspaces
    const { data: memberships } = await supabase
      .from("workspace_members")
      .select("workspace_id")
      .eq("user_id", user.id);

    if (!memberships || memberships.length === 0) {
      return NextResponse.json({ reports: [] });
    }

    const workspaceIds = memberships.map((m) => m.workspace_id);

    // Parse query parameters
    const url = new URL(req.url);
    const week_start = url.searchParams.get("week_start");
    const workspace_id = url.searchParams.get("workspace_id");

    // Build query
    let query = supabase
      .from("weekly_capacity_reports")
      .select("*")
      .in("workspace_id", workspaceIds)
      .order("week_start", { ascending: false })
      .order("crew_name", { ascending: true });

    // Apply filters
    if (workspace_id) {
      query = query.eq("workspace_id", workspace_id);
    }
    if (week_start) {
      query = query.eq("week_start", week_start);
    } else {
      // Default to current week and next 4 weeks
      const today = new Date();
      const currentWeek = new Date(today);
      currentWeek.setDate(today.getDate() - today.getDay()); // Start of week (Sunday)
      const fourWeeksLater = new Date(currentWeek);
      fourWeeksLater.setDate(fourWeeksLater.getDate() + 28);

      query = query
        .gte("week_start", currentWeek.toISOString().slice(0, 10))
        .lte("week_start", fourWeeksLater.toISOString().slice(0, 10));
    }

    const { data: reports, error } = await query;

    if (error) {
      console.error("Error fetching capacity reports:", error);
      return NextResponse.json(
        { error: error.message || "Failed to fetch capacity reports" },
        { status: 500 }
      );
    }

    // Calculate summary statistics
    const summary = {
      total_crews: new Set(reports?.map((r) => r.crew_id) || []).size,
      total_jobs_scheduled: reports?.reduce((sum, r) => sum + (r.jobs_scheduled || 0), 0) || 0,
      total_squares_scheduled: reports?.reduce((sum, r) => sum + Number(r.total_squares_scheduled || 0), 0) || 0,
      total_projected_revenue: reports?.reduce((sum, r) => sum + Number(r.projected_revenue || 0), 0) || 0,
      overloaded_crews: reports?.filter((r) => r.is_overloaded).length || 0,
      total_delayed_jobs: reports?.reduce((sum, r) => sum + (r.delayed_count || 0), 0) || 0,
    };

    return NextResponse.json({
      reports: reports || [],
      summary,
      count: reports?.length || 0,
    });
  } catch (error: any) {
    console.error("Capacity report API error:", error);
    return NextResponse.json(
      { error: "Internal server error", message: error.message },
      { status: 500 }
    );
  }
}
































