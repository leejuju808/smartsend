// Block 64000 — Production Timeline Optimizer
// POST /api/timeline/check-delays
// Runs delay detection for all active jobs (should run every 15 minutes via cron)

import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";

export async function POST(req: NextRequest) {
  try {
    const supabase = createRouteHandlerClient({ cookies });
    const { data: { user } } = await supabase.auth.getUser();
    
    // Allow service role for cron jobs
    const authHeader = req.headers.get("authorization");
    const isServiceRole = authHeader?.includes(process.env.SUPABASE_SERVICE_ROLE_KEY || "");
    
    if (!user && !isServiceRole) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const body = await req.json().catch(() => ({}));
    const { workspace_id } = body;

    // Run delay detection
    const { data: alertsCreated, error: detectError } = await supabase.rpc(
      "detect_production_delays",
      { p_workspace_id: workspace_id || null }
    );

    if (detectError) {
      console.error("Error detecting delays:", detectError);
      return NextResponse.json(
        { error: "Failed to detect delays", details: detectError.message },
        { status: 500 }
      );
    }

    // Get recent alerts for response
    const { data: recentAlerts, error: alertsError } = await supabase
      .from("delay_alerts")
      .select(`
        *,
        roofing_jobs!inner(id, title, workspace_id)
      `)
      .eq("resolved", false)
      .order("created_at", { ascending: false })
      .limit(50);

    if (alertsError) {
      console.error("Error fetching alerts:", alertsError);
    }

    return NextResponse.json({
      success: true,
      alerts_created: alertsCreated || 0,
      recent_alerts: recentAlerts || []
    });
  } catch (error: any) {
    console.error("Error in /api/timeline/check-delays:", error);
    return NextResponse.json(
      { error: error.message || "Unknown error" },
      { status: 500 }
    );
  }
}

// GET /api/timeline/check-delays?workspace_id=xxx
// Get active delay alerts for a workspace
export async function GET(req: NextRequest) {
  try {
    const supabase = createRouteHandlerClient({ cookies });
    const { data: { user } } = await supabase.auth.getUser();
    
    if (!user) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const workspace_id = searchParams.get("workspace_id");
    const resolved = searchParams.get("resolved") === "true";
    const severity = searchParams.get("severity");

    // Get user's workspace if not provided
    let userWorkspaceId = workspace_id;
    if (!userWorkspaceId) {
      const { data: member } = await supabase
        .from("workspace_members")
        .select("workspace_id")
        .eq("user_id", user.id)
        .limit(1)
        .single();
      
      userWorkspaceId = member?.workspace_id || null;
    }

    if (!userWorkspaceId) {
      return NextResponse.json(
        { error: "No workspace found" },
        { status: 400 }
      );
    }

    // Build query
    let query = supabase
      .from("delay_alerts")
      .select(`
        *,
        roofing_jobs!inner(id, title, status, crew_id),
        crews(id, name)
      `)
      .eq("workspace_id", userWorkspaceId)
      .eq("resolved", resolved)
      .order("created_at", { ascending: false });

    if (severity) {
      query = query.eq("severity", severity);
    }

    const { data: alerts, error } = await query.limit(100);

    if (error) {
      console.error("Error fetching alerts:", error);
      return NextResponse.json(
        { error: "Failed to fetch alerts", details: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      alerts: alerts || []
    });
  } catch (error: any) {
    console.error("Error in GET /api/timeline/check-delays:", error);
    return NextResponse.json(
      { error: error.message || "Unknown error" },
      { status: 500 }
    );
  }
}




























