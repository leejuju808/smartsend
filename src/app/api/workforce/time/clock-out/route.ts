// Block 251600 — Crew Time Tracking System
// POST /api/workforce/time/clock-out
// Clock out with GPS validation

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST(req: NextRequest) {
  try {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const { entry_id, lat, lng } = body;

    // Validate required fields
    if (!entry_id || lat === undefined || lng === undefined) {
      return NextResponse.json(
        { error: "entry_id, lat, and lng are required" },
        { status: 400 }
      );
    }

    // Get the clock-in record
    const { data: record, error: recordError } = await supabase
      .from("crew_time_clock")
      .select("*")
      .eq("id", entry_id)
      .single();

    if (recordError || !record) {
      return NextResponse.json({ error: "Clock-in entry not found" }, { status: 404 });
    }

    // Check if already clocked out
    if (record.clock_out) {
      return NextResponse.json(
        { error: "Already clocked out" },
        { status: 400 }
      );
    }

    // Get job location
    const { data: job, error: jobError } = await supabase
      .from("jobs")
      .select("id, site_lat, site_lng")
      .eq("id", record.job_id)
      .single();

    if (jobError || !job) {
      return NextResponse.json({ error: "Job not found" }, { status: 404 });
    }

    // Validate GPS location using SQL function
    if (job.site_lat && job.site_lng) {
      const { data: valid, error: validError } = await supabase.rpc("is_within_radius", {
        lat1: lat,
        lng1: lng,
        lat2: job.site_lat,
        lng2: job.site_lng,
        radius_feet: 150,
      });

      if (validError) {
        console.error("GPS validation error:", validError);
        return NextResponse.json(
          { error: "GPS validation failed" },
          { status: 500 }
        );
      }

      if (!valid) {
        return NextResponse.json(
          { 
            error: "Not at job site. Move closer to clock out.",
            message: "You must be within 150 feet of the job site to clock out.",
            job_location: { lat: job.site_lat, lng: job.site_lng },
            your_location: { lat, lng }
          },
          { status: 400 }
        );
      }
    }

    // Calculate duration
    const clockInTime = new Date(record.clock_in);
    const clockOutTime = new Date();
    const durationMinutes = Math.round(
      (clockOutTime.getTime() - clockInTime.getTime()) / 60000
    );

    // Update clock-out record
    const { data: updatedEntry, error: updateError } = await supabase
      .from("crew_time_clock")
      .update({
        clock_out: clockOutTime.toISOString(),
        clock_out_lat: lat,
        clock_out_lng: lng,
        duration_minutes: durationMinutes,
      })
      .eq("id", entry_id)
      .select("*")
      .single();

    if (updateError) {
      console.error("Clock-out error:", updateError);
      return NextResponse.json(
        { error: "Failed to clock out", details: updateError.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      entry: updatedEntry,
      duration_minutes: durationMinutes,
      duration_hours: (durationMinutes / 60).toFixed(2),
      message: "Clocked out successfully",
    });
  } catch (error: any) {
    console.error("Error in clock-out API:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}
























