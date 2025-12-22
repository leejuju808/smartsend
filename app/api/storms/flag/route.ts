// Block 30041 — SmartSend Roofing "Storm Event Lead Surge Engine" v1
// API Route: Get/Update Storm Flag for Workspace
// GET /api/storms/flag?workspace_id=xxx
// POST /api/storms/flag (body: { workspace_id, active })

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

    if (!workspace_id) {
      return NextResponse.json(
        { error: "workspace_id required" },
        { status: 400 }
      );
    }

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

    // Get storm flag
    const { data: flag, error: flagError } = await supabase
      .from("storm_flags")
      .select(`
        *,
        storm_events:storm_events (
          id,
          zip_code,
          event_type,
          severity,
          detected_at,
          expires_at,
          metadata
        )
      `)
      .eq("workspace_id", workspace_id)
      .single();

    if (flagError && flagError.code !== "PGRST116") {
      // PGRST116 is "not found" - that's ok, return inactive flag
      console.error("Error getting storm flag:", flagError);
      return NextResponse.json(
        { error: "Failed to get storm flag" },
        { status: 500 }
      );
    }

    // If no flag exists, return default inactive flag
    if (!flag) {
      return NextResponse.json({
        workspace_id,
        active: false,
        last_triggered: null,
        active_storm_event_ids: [],
        storm_events: [],
      });
    }

    // Get full storm event details
    const stormEventIds = flag.active_storm_event_ids || [];
    let stormEvents: any[] = [];

    if (stormEventIds.length > 0) {
      const { data: events, error: eventsError } = await supabase
        .from("storm_events")
        .select("*")
        .in("id", stormEventIds);

      if (!eventsError && events) {
        stormEvents = events;
      }
    }

    return NextResponse.json({
      ...flag,
      storm_events: stormEvents,
    });
  } catch (error) {
    console.error("Error in storms flag GET API:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
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

    const body = await req.json();
    const { workspace_id, active } = body;

    if (!workspace_id) {
      return NextResponse.json(
        { error: "workspace_id required" },
        { status: 400 }
      );
    }

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

    // Update or create storm flag
    const updateData: any = {
      workspace_id,
      active: active !== undefined ? active : false,
      updated_at: new Date().toISOString(),
    };

    if (active) {
      updateData.last_triggered = new Date().toISOString();
    }

    const { data: flag, error: flagError } = await supabase
      .from("storm_flags")
      .upsert(updateData, {
        onConflict: "workspace_id",
      })
      .select()
      .single();

    if (flagError) {
      console.error("Error updating storm flag:", flagError);
      return NextResponse.json(
        { error: "Failed to update storm flag" },
        { status: 500 }
      );
    }

    return NextResponse.json({ flag });
  } catch (error) {
    console.error("Error in storms flag POST API:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}


































