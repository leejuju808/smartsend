// Block 36555 — SmartSend Roofing "Smart Financing Engine + Instant Pre-Qual" v1
// API Route: Get financing dashboard stats

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

export async function GET(req: NextRequest) {
  try {
    const supabase = createRouteHandlerClient({ cookies });
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const workspaceId = searchParams.get("workspace_id");
    const days = parseInt(searchParams.get("days") || "30");

    if (!workspaceId) {
      return NextResponse.json(
        { error: "workspace_id is required" },
        { status: 400 }
      );
    }

    // Verify user has access to workspace
    const { data: member } = await supabase
      .from("workspace_members")
      .select("workspace_id")
      .eq("workspace_id", workspaceId)
      .eq("user_id", user.id)
      .single();

    if (!member) {
      return NextResponse.json(
        { error: "Access denied" },
        { status: 403 }
      );
    }

    // Use service client for RPC
    const serviceSupabase = createClient(supabaseUrl, supabaseServiceKey);

    // Get dashboard stats
    const { data: stats, error: statsError } = await serviceSupabase.rpc(
      "get_financing_dashboard_stats_v2",
      {
        p_workspace_id: workspaceId,
        p_days: days,
      }
    );

    if (statsError) {
      throw statsError;
    }

    // Get recent financing activities
    const { data: recentActivities, error: activitiesError } =
      await serviceSupabase
        .from("financing_status")
        .select(`
          id,
          clicked,
          started,
          prequalified,
          approved,
          declined,
          abandoned,
          monthly_payment,
          apr,
          plan_length,
          created_at,
          updated_at,
          proposals:proposal_id (
            id,
            proposal_data,
            leads:lead_id (
              id,
              name,
              email
            )
          )
        `)
        .eq("proposals.workspace_id", workspaceId)
        .order("updated_at", { ascending: false })
        .limit(20);

    // Get financing breakdown by status
    const { data: statusBreakdown } = await serviceSupabase
      .from("financing_status")
      .select(`
        approved,
        declined,
        prequalified,
        abandoned,
        proposals:proposal_id!inner(workspace_id)
      `)
      .eq("proposals.workspace_id", workspaceId);

    const breakdown = {
      approved: statusBreakdown?.filter((s) => s.approved).length || 0,
      declined: statusBreakdown?.filter((s) => s.declined).length || 0,
      prequalified:
        statusBreakdown?.filter((s) => s.prequalified).length || 0,
      abandoned: statusBreakdown?.filter((s) => s.abandoned).length || 0,
      clicked_but_not_started:
        statusBreakdown?.filter(
          (s) => !s.started && !s.approved && !s.declined
        ).length || 0,
    };

    return NextResponse.json({
      stats: stats || {},
      recent_activities: recentActivities || [],
      breakdown,
    });
  } catch (error: any) {
    console.error("Error getting financing dashboard:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}
