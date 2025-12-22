// Block 65000 — SmartSend Roofing Homeowner Experience Portal v2
// API endpoint: Update crew location (en route, on site, left site)
// Called by crew app when they clock in/out or update location

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: { persistSession: false },
});

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      job_id,
      crew_member_id,
      location_type,
      latitude,
      longitude,
      address,
    } = body;

    if (!job_id || !location_type) {
      return NextResponse.json(
        { error: "job_id and location_type are required" },
        { status: 400 }
      );
    }

    if (!["en_route", "on_site", "left_site"].includes(location_type)) {
      return NextResponse.json(
        { error: "location_type must be: en_route, on_site, or left_site" },
        { status: 400 }
      );
    }

    // Insert location tracking
    const { data: location, error: locationError } = await supabase
      .from("crew_location_tracking")
      .insert({
        job_id,
        crew_member_id: crew_member_id || null,
        location_type,
        latitude: latitude || null,
        longitude: longitude || null,
        address: address || null,
      })
      .select()
      .single();

    if (locationError) {
      console.error("Error tracking crew location:", locationError);
      return NextResponse.json(
        { error: "Failed to track crew location" },
        { status: 500 }
      );
    }

    // Get homeowner info to send notification
    const { data: homeowners } = await supabase
      .from("homeowners")
      .select("id, email, name")
      .eq("job_id", job_id)
      .limit(1);

    // Create notification for homeowner based on location type
    if (homeowners && homeowners.length > 0) {
      const homeowner = homeowners[0];
      let notificationMessage = "";
      let notificationType: string = "general_update";

      switch (location_type) {
        case "en_route":
          notificationMessage = "Your crew is on the way! They should arrive soon.";
          notificationType = "crew_en_route";
          break;
        case "on_site":
          notificationMessage = "Great news! Your crew has arrived and is starting work.";
          notificationType = "crew_arrived";
          break;
        case "left_site":
          notificationMessage = "Your crew has finished for the day. Check out today's progress!";
          notificationType = "day_end_summary";
          break;
      }

      if (notificationMessage) {
        await supabase.from("homeowner_notifications").insert({
          job_id,
          homeowner_id: homeowner.id,
          type: notificationType,
          message: notificationMessage,
        });
      }
    }

    return NextResponse.json({
      success: true,
      location,
    });
  } catch (error: any) {
    console.error("Error in crew location:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}




























