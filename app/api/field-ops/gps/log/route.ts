// Block 255400 — Field Operations Command v1
// API Route: Log Crew GPS Location
// POST /api/field-ops/gps/log

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

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
    const { crew_id, crew_member_id, lat, lng, accuracy, heading, speed } = body;

    if (!crew_id || !lat || !lng) {
      return NextResponse.json(
        { error: "Missing required fields: crew_id, lat, lng" },
        { status: 400 }
      );
    }

    // Verify crew exists and user has access
    const { data: crew, error: crewError } = await supabase
      .from("crews")
      .select("id, workspace_id")
      .eq("id", crew_id)
      .single();

    if (crewError || !crew) {
      return NextResponse.json(
        { error: "Crew not found" },
        { status: 404 }
      );
    }

    // Verify user has access to workspace
    const { data: membership } = await supabase
      .from("workspace_members")
      .select("workspace_id")
      .eq("workspace_id", crew.workspace_id)
      .eq("user_id", user.id)
      .single();

    if (!membership) {
      return NextResponse.json(
        { error: "Access denied" },
        { status: 403 }
      );
    }

    // Insert GPS log
    const { data: gpsLog, error: insertError } = await supabase
      .from("crew_gps_logs")
      .insert({
        crew_id,
        crew_member_id: crew_member_id || null,
        lat: parseFloat(lat),
        lng: parseFloat(lng),
        accuracy: accuracy ? parseFloat(accuracy) : null,
        heading: heading ? parseFloat(heading) : null,
        speed: speed ? parseFloat(speed) : null,
      })
      .select()
      .single();

    if (insertError) {
      console.error("Error inserting GPS log:", insertError);
      return NextResponse.json(
        { error: insertError.message },
        { status: 400 }
      );
    }

    return NextResponse.json({ gps_log: gpsLog }, { status: 201 });
  } catch (error: any) {
    console.error("Error in GPS log endpoint:", error);
    return NextResponse.json(
      { error: error.message || "Unknown error" },
      { status: 500 }
    );
  }
}

// GET: Get latest GPS locations for all active crews
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

    // Get workspace_id from query params or user's workspace
    const { searchParams } = new URL(req.url);
    const workspaceId = searchParams.get("workspace_id");

    if (!workspaceId) {
      return NextResponse.json(
        { error: "workspace_id is required" },
        { status: 400 }
      );
    }

    // Verify user has access to workspace
    const { data: membership } = await supabase
      .from("workspace_members")
      .select("workspace_id")
      .eq("workspace_id", workspaceId)
      .eq("user_id", user.id)
      .single();

    if (!membership) {
      return NextResponse.json(
        { error: "Access denied" },
        { status: 403 }
      );
    }

    // Get active crews GPS using the helper function
    const { data: crewsGps, error: gpsError } = await supabase.rpc(
      "get_active_crews_gps"
    );

    if (gpsError) {
      console.error("Error fetching crews GPS:", gpsError);
      return NextResponse.json(
        { error: gpsError.message },
        { status: 400 }
      );
    }

    // Filter by workspace (if needed, can be done in the function)
    const { data: workspaceCrews } = await supabase
      .from("crews")
      .select("id")
      .eq("workspace_id", workspaceId)
      .eq("is_active", true);

    const crewIds = workspaceCrews?.map((c) => c.id) || [];
    const filteredGps = crewsGps?.filter((gps: any) =>
      crewIds.includes(gps.crew_id)
    );

    return NextResponse.json({ crews_gps: filteredGps || [] }, { status: 200 });
  } catch (error: any) {
    console.error("Error in GPS get endpoint:", error);
    return NextResponse.json(
      { error: error.message || "Unknown error" },
      { status: 500 }
    );
  }
}





















