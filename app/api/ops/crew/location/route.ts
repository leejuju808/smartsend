// POST /api/ops/crew/location - Update crew location (GPS tracking)
// Used by mobile app to send real-time crew GPS coordinates

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const { crew_id, lat, lng, accuracy, heading, speed, status } = body;

    if (!crew_id || !lat || !lng) {
      return NextResponse.json(
        { error: "Missing required fields: crew_id, lat, lng" },
        { status: 400 }
      );
    }

    // Verify user is a member of the crew
    const { data: crewMember, error: crewError } = await supabase
      .from("crew_members")
      .select("crew_id, workspace_id")
      .eq("crew_id", crew_id)
      .eq("user_id", user.id)
      .single();

    if (crewError || !crewMember) {
      return NextResponse.json(
        { error: "User is not a member of this crew" },
        { status: 403 }
      );
    }

    // Insert location update
    const { data: location, error: locationError } = await supabase
      .from("crew_locations")
      .insert({
        crew_id,
        workspace_id: crewMember.workspace_id,
        lat: parseFloat(lat),
        lng: parseFloat(lng),
        accuracy: accuracy ? parseFloat(accuracy) : null,
        heading: heading ? parseFloat(heading) : null,
        speed: speed ? parseFloat(speed) : null,
        status: status || "traveling",
      })
      .select()
      .single();

    if (locationError) {
      console.error("Error inserting crew location:", locationError);
      return NextResponse.json(
        { error: "Failed to update location" },
        { status: 500 }
      );
    }

    // Add activity feed entry
    await supabase.from("ops_activity_feed").insert({
      workspace_id: crewMember.workspace_id,
      crew_id,
      event_type: "crew_location_update",
      title: `Crew location updated`,
      description: `Crew updated location: ${lat}, ${lng}`,
      icon: "map-pin",
      color: "blue",
      metadata: {
        lat,
        lng,
        status,
      },
    });

    return NextResponse.json({ success: true, location });
  } catch (error) {
    console.error("Error in POST /api/ops/crew/location:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

























