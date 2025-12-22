// Block 30041 — SmartSend Roofing "Storm Event Lead Surge Engine" v1
// API Route: Get Storm Events
// GET /api/storms/events?workspace_id=xxx

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

    const { searchParams } = new URL(req.url);
    const workspace_id = searchParams.get("workspace_id");
    const active_only = searchParams.get("active_only") === "true";

    // If workspace_id provided, get storms for that workspace
    if (workspace_id) {
      // Verify user has access to this workspace
      const { data: membership } = await supabase
        .from("workspace_members")
        .select("workspace_id")
        .eq("workspace_id", workspace_id)
        .eq("user_id", user.id)
        .single();

      if (!membership) {
        return NextResponse.json(
          { error: "Access denied" },
          { status: 403 }
        );
      }

      // Get active storms for this workspace using the helper function
      const { data: storms, error: stormsError } = await supabase.rpc(
        "get_active_storms_for_workspace",
        { p_workspace_id: workspace_id }
      );

      if (stormsError) {
        console.error("Error getting storms:", stormsError);
        return NextResponse.json(
          { error: "Failed to get storms" },
          { status: 500 }
        );
      }

      return NextResponse.json({ storms: storms || [] });
    }

    // Otherwise, get all recent storms (public data)
    let query = supabase
      .from("storm_events")
      .select("*")
      .order("detected_at", { ascending: false })
      .limit(100);

    if (active_only) {
      query = query.or("expires_at.is.null,expires_at.gt." + new Date().toISOString());
    }

    const { data: storms, error: stormsError } = await query;

    if (stormsError) {
      console.error("Error getting storms:", stormsError);
      return NextResponse.json(
        { error: "Failed to get storms" },
        { status: 500 }
      );
    }

    return NextResponse.json({ storms: storms || [] });
  } catch (error) {
    console.error("Error in storms events API:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}


































