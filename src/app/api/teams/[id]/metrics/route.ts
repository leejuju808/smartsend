// Block 25220 — SmartSend Roofing Multi-Team Support v1
// API Route: Team Performance Metrics
// GET /api/teams/[id]/metrics - Get team metrics
// POST /api/teams/[id]/metrics - Record/update team metrics

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = createClient();
    const { id } = await params;
    const { searchParams } = new URL(req.url);
    const periodType = searchParams.get("period_type") || "month";
    const limit = parseInt(searchParams.get("limit") || "12", 10);

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Get team
    const { data: team } = await supabase
      .from("roofing_teams")
      .select("org_id")
      .eq("id", id)
      .single();

    if (!team) {
      return NextResponse.json({ error: "Team not found" }, { status: 404 });
    }

    // Verify access
    const { data: membership } = await supabase
      .from("org_memberships")
      .select("org_id")
      .eq("org_id", team.org_id)
      .eq("user_id", user.id)
      .eq("status", "active")
      .single();

    if (!membership) {
      return NextResponse.json({ error: "Access denied" }, { status: 403 });
    }

    // Get metrics
    const { data: metrics, error: metricsError } = await supabase
      .from("team_performance_metrics")
      .select("*")
      .eq("team_id", id)
      .eq("period_type", periodType)
      .order("period_start", { ascending: false })
      .limit(limit);

    if (metricsError) {
      console.error("Error fetching team metrics:", metricsError);
      return NextResponse.json(
        { error: "Failed to fetch team metrics" },
        { status: 500 }
      );
    }

    return NextResponse.json({ metrics: metrics || [] });
  } catch (error) {
    console.error("Error in GET /api/teams/[id]/metrics:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = createClient();
    const { id } = await params;

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const {
      period_start,
      period_end,
      period_type = "month",
      metrics,
    } = body;

    if (!period_start || !period_end || !metrics) {
      return NextResponse.json(
        {
          error:
            "period_start, period_end, and metrics are required",
        },
        { status: 400 }
      );
    }

    // Get team
    const { data: team } = await supabase
      .from("roofing_teams")
      .select("org_id")
      .eq("id", id)
      .single();

    if (!team) {
      return NextResponse.json({ error: "Team not found" }, { status: 404 });
    }

    // Verify user is owner/admin or team leader
    const { data: membership } = await supabase
      .from("org_memberships")
      .select("role")
      .eq("org_id", team.org_id)
      .eq("user_id", user.id)
      .eq("status", "active")
      .single();

    const { data: teamMember } = await supabase
      .from("team_members")
      .select("role")
      .eq("team_id", id)
      .eq("user_id", user.id)
      .eq("is_active", true)
      .single();

    const canManage =
      membership?.role === "owner" ||
      membership?.role === "admin" ||
      teamMember?.role === "leader";

    if (!canManage) {
      return NextResponse.json(
        {
          error:
            "Only owners, admins, or team leaders can update metrics",
        },
        { status: 403 }
      );
    }

    // Upsert metrics
    const { data: metric, error: metricError } = await supabase
      .from("team_performance_metrics")
      .upsert(
        {
          team_id: id,
          period_start,
          period_end,
          period_type,
          metrics,
        },
        {
          onConflict: "team_id,period_start,period_end,period_type",
        }
      )
      .select()
      .single();

    if (metricError) {
      console.error("Error saving team metrics:", metricError);
      return NextResponse.json(
        { error: "Failed to save team metrics" },
        { status: 500 }
      );
    }

    return NextResponse.json({ metric }, { status: 201 });
  } catch (error) {
    console.error("Error in POST /api/teams/[id]/metrics:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}




































