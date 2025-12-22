// Block 26410 — SmartSend Roofing Lead Source ROI Tracker v1
// API Route: Lead Source ROI Data
// GET /api/lead-source-roi

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(req: NextRequest) {
  try {
    const supabase = await createClient();

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

    // Check if user is owner or manager (owner/manager access)
    const { data: workspace } = await supabase
      .from("workspaces")
      .select("owner_id")
      .eq("id", workspaceId)
      .single();

    if (!workspace || workspace.owner_id !== user.id) {
      // Check if user has owner/manager role
      const { data: userRole } = await supabase
        .from("users")
        .select("role")
        .eq("auth_user_id", user.id)
        .single();

      if (userRole?.role !== "owner" && userRole?.role !== "manager") {
        return NextResponse.json(
          { error: "Owner or manager access required" },
          { status: 403 }
        );
      }
    }

    // Get lead source ROI data
    const { data: sources, error: sourcesError } = await supabase
      .from("roofing_lead_source_roi")
      .select("*")
      .eq("workspace_id", workspaceId)
      .order("channel_type", { ascending: true })
      .order("lead_source_name", { ascending: true });

    if (sourcesError) {
      console.error("Lead source ROI error:", sourcesError);
      return NextResponse.json(
        { error: "Failed to fetch lead source ROI data" },
        { status: 500 }
      );
    }

    // Get SmartSend vs Others comparison
    const { data: comparison, error: comparisonError } = await supabase
      .from("roofing_channel_vs_smartsend")
      .select("*")
      .eq("workspace_id", workspaceId);

    if (comparisonError) {
      console.error("Comparison error:", comparisonError);
      // Don't fail if comparison view doesn't exist yet, just return empty array
    }

    return NextResponse.json({
      sources: sources || [],
      comparison: comparison || [],
    });
  } catch (error) {
    console.error("Lead source ROI API error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}



































