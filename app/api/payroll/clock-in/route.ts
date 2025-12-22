// Block 51000 — SmartSend Roofing Crew Payroll + Labor Cost Tracking System v1
// API Route: Clock In
// POST /api/payroll/clock-in

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    
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
    const { member_id, job_id, latitude, longitude, address } = body;

    if (!member_id || !job_id) {
      return NextResponse.json(
        { error: "member_id and job_id are required" },
        { status: 400 }
      );
    }

    // Verify member exists and user has access
    const { data: member, error: memberError } = await supabase
      .from("crew_members")
      .select("id, workspace_id, crew_id")
      .eq("id", member_id)
      .single();

    if (memberError || !member) {
      return NextResponse.json(
        { error: "Crew member not found" },
        { status: 404 }
      );
    }

    // Get pay settings to check GPS requirements
    const { data: paySettings } = await supabase
      .from("crew_pay_settings")
      .select("*")
      .eq("member_id", member_id)
      .eq("is_active", true)
      .single();

    // Verify GPS if required
    let gps_verified = false;
    let gps_in = null;

    if (paySettings?.require_gps_verification && latitude && longitude) {
      // Call GPS verification function
      const { data: verified, error: gpsError } = await supabase.rpc("verify_gps_location", {
        p_job_id: job_id,
        p_latitude: latitude,
        p_longitude: longitude,
        p_radius_meters: paySettings.job_site_radius_meters || 100,
      });

      if (gpsError) {
        return NextResponse.json(
          { error: "GPS verification failed", details: gpsError.message },
          { status: 400 }
        );
      }

      gps_verified = verified || false;

      gps_in = {
        lat: latitude,
        lng: longitude,
        address: address || null,
        accuracy: null,
        timestamp: new Date().toISOString(),
      };
    }

    // Check if there's an active timecard for this member/job
    const { data: existingTimecard } = await supabase
      .from("timecards")
      .select("*")
      .eq("member_id", member_id)
      .eq("job_id", job_id)
      .eq("status", "active")
      .single();

    let timecard;

    if (existingTimecard) {
      // Update existing timecard
      const { data, error } = await supabase
        .from("timecards")
        .update({
          clock_in: new Date().toISOString(),
          gps_in,
          gps_verified,
          status: "active",
          updated_at: new Date().toISOString(),
        })
        .eq("id", existingTimecard.id)
        .select()
        .single();

      if (error) {
        return NextResponse.json(
          { error: "Failed to update timecard", details: error.message },
          { status: 500 }
        );
      }

      timecard = data;
    } else {
      // Create new timecard
      const { data, error } = await supabase
        .from("timecards")
        .insert({
          member_id,
          job_id,
          clock_in: new Date().toISOString(),
          gps_in,
          gps_verified,
          status: "active",
        })
        .select()
        .single();

      if (error) {
        return NextResponse.json(
          { error: "Failed to create timecard", details: error.message },
          { status: 500 }
        );
      }

      timecard = data;
    }

    return NextResponse.json({
      success: true,
      timecard,
      message: existingTimecard ? "Clock-in updated" : "Clock-in successful",
    });
  } catch (error: any) {
    console.error("Error in clock-in API:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}
































