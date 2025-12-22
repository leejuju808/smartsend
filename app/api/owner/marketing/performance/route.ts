// Block 27460 — SmartSend Roofing Marketing & Source Attribution Brain v1
// API Route: Marketing Performance Data
// GET /api/owner/marketing/performance

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
        return NextResponse.json({ error: "Owner access required" }, { status: 403 });
      }
    }

    // Get marketing ROI data from view
    const { data: roi, error: roiError } = await supabase
      .from("roofing_marketing_roi")
      .select("*")
      .eq("workspace_id", workspaceId)
      .order("roi_multiplier", { ascending: false });

    if (roiError) {
      console.error("Marketing ROI error:", roiError);
      return NextResponse.json(
        { error: "Failed to load marketing data" },
        { status: 500 }
      );
    }

    return NextResponse.json({ sources: roi || [] });
  } catch (error: any) {
    console.error("Marketing performance API error:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}



































