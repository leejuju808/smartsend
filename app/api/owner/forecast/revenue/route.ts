// Block 27520 — SmartSend Roofing Revenue Forecast API
// GET /api/owner/forecast/revenue
// Returns 30/60/90 day revenue projections

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET() {
  try {
    const supabase = createClient();

    // Ensure user is authenticated
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Get user's workspace
    const { data: membership, error: memError } = await supabase
      .from("workspace_members")
      .select("workspace_id")
      .eq("user_id", user.id)
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();

    if (memError || !membership) {
      return NextResponse.json({ error: "No workspace found" }, { status: 404 });
    }

    const workspaceId = membership.workspace_id;

    // Check if user is owner
    const { data: workspace } = await supabase
      .from("workspaces")
      .select("owner_id")
      .eq("id", workspaceId)
      .single();

    if (!workspace || workspace.owner_id !== user.id) {
      // Check if user has owner role
      const { data: userRole } = await supabase
        .from("users")
        .select("role")
        .eq("auth_user_id", user.id)
        .single();

      if (userRole?.role !== "owner") {
        return NextResponse.json(
          { error: "Owner access required" },
          { status: 403 }
        );
      }
    }

    // Get revenue projection windows (30/60/90 day summaries)
    const { data: windows, error: windowsError } = await supabase
      .from("roofing_revenue_projection_windows")
      .select("*")
      .eq("workspace_id", workspaceId)
      .order("window_bucket", { ascending: true });

    if (windowsError) {
      console.error("Error fetching revenue windows:", windowsError);
    }

    // Get daily revenue projection
    const { data: daily, error: dailyError } = await supabase
      .from("roofing_revenue_projection")
      .select("*")
      .eq("workspace_id", workspaceId)
      .order("date_bucket", { ascending: true });

    if (dailyError) {
      console.error("Error fetching daily revenue:", dailyError);
    }

    // Get owner target if set
    const { data: target, error: targetError } = await supabase
      .from("roofing_owner_targets")
      .select("monthly_revenue_target")
      .eq("workspace_id", workspaceId)
      .maybeSingle();

    if (targetError) {
      console.error("Error fetching owner target:", targetError);
    }

    return NextResponse.json({
      windows: windows || [],
      daily: daily || [],
      monthly_target: target?.monthly_revenue_target || null,
    });
  } catch (error: any) {
    console.error("Error in revenue forecast API:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}



































