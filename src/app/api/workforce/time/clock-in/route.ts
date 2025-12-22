// Block 251600 — Crew Time Tracking System
// POST /api/workforce/time/clock-in
// Clock in with GPS validation

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
    const { employee_id, job_id, lat, lng } = body;

    // Validate required fields
    if (!employee_id || !job_id || lat === undefined || lng === undefined) {
      return NextResponse.json(
        { error: "employee_id, job_id, lat, and lng are required" },
        { status: 400 }
      );
    }

    // Verify employee exists and is active
    const { data: employee, error: empError } = await supabase
      .from("workforce_employees")
      .select("id, status, company_id")
      .eq("id", employee_id)
      .eq("status", "active")
      .single();

    if (empError || !employee) {
      return NextResponse.json(
        { error: "Employee not found or not active" },
        { status: 404 }
      );
    }

    // Get job location
    const { data: job, error: jobError } = await supabase
      .from("jobs")
      .select("id, site_lat, site_lng")
      .eq("id", job_id)
      .single();

    if (jobError || !job) {
      return NextResponse.json({ error: "Job not found" }, { status: 404 });
    }

    // Check if job has GPS coordinates set
    if (!job.site_lat || !job.site_lng) {
      return NextResponse.json(
        { error: "Job site location not configured. Please set GPS coordinates for this job." },
        { status: 400 }
      );
    }

    // Validate GPS location using SQL function
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
          error: "Not at job site. Move closer to clock in.",
          message: "You must be within 150 feet of the job site to clock in.",
          job_location: { lat: job.site_lat, lng: job.site_lng },
          your_location: { lat, lng }
        },
        { status: 400 }
      );
    }

    // Check if already clocked in for this job
    const { data: existingClock, error: checkError } = await supabase
      .from("crew_time_clock")
      .select("id")
      .eq("employee_id", employee_id)
      .eq("job_id", job_id)
      .is("clock_out", null)
      .single();

    if (existingClock) {
      return NextResponse.json(
        { error: "Already clocked in for this job" },
        { status: 400 }
      );
    }

    // Create clock-in record
    const { data: clockEntry, error: insertError } = await supabase
      .from("crew_time_clock")
      .insert({
        job_id,
        employee_id,
        clock_in: new Date().toISOString(),
        clock_in_lat: lat,
        clock_in_lng: lng,
      })
      .select("*")
      .single();

    if (insertError) {
      console.error("Clock-in error:", insertError);
      return NextResponse.json(
        { error: "Failed to clock in", details: insertError.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      entry: clockEntry,
      message: "Clocked in successfully",
    });
  } catch (error: any) {
    console.error("Error in clock-in API:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}
























