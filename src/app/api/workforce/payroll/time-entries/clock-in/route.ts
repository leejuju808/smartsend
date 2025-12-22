// Block 256900 — Payroll & Timekeeping Engine v1
// POST /api/workforce/payroll/time-entries/clock-in
// Clock in with GPS geofence verification (jobsites, company yard, approved zones)

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
    const { employee_id, job_id, lat, lng, address } = body;

    // Validate required fields
    if (!employee_id || !lat || !lng) {
      return NextResponse.json(
        { error: "employee_id, lat, and lng are required" },
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

    // Verify GPS location against approved zones
    const { data: gpsVerification, error: gpsError } = await supabase.rpc(
      "verify_gps_clock_in",
      {
        p_company_id: employee.company_id,
        p_job_id: job_id || null,
        p_lat: lat,
        p_lng: lng,
      }
    );

    if (gpsError) {
      console.error("GPS verification error:", gpsError);
      return NextResponse.json(
        { error: "GPS verification failed", details: gpsError.message },
        { status: 500 }
      );
    }

    if (!gpsVerification || !gpsVerification.verified) {
      return NextResponse.json(
        {
          error: "Clock-In Denied: You are not at the correct job location.",
          message:
            "You must be at an approved location (jobsite, company yard, or approved zone) to clock in.",
          your_location: { lat, lng },
        },
        { status: 400 }
      );
    }

    // Check if already clocked in (no clock_out)
    const { data: existingEntry, error: checkError } = await supabase
      .from("time_entries")
      .select("id")
      .eq("employee_id", employee_id)
      .is("clock_out", null)
      .single();

    if (existingEntry) {
      return NextResponse.json(
        { error: "Already clocked in. Please clock out first." },
        { status: 400 }
      );
    }

    // Create time entry with GPS verification
    const gpsData = {
      lat: parseFloat(lat),
      lng: parseFloat(lng),
      address: address || null,
      accuracy: null,
      timestamp: new Date().toISOString(),
      verified: true,
      zone_id: gpsVerification.zone_id,
      zone_name: gpsVerification.zone_name,
      zone_type: gpsVerification.zone_type,
    };

    const { data: timeEntry, error: insertError } = await supabase
      .from("time_entries")
      .insert({
        employee_id,
        job_id: job_id || null,
        company_id: employee.company_id,
        clock_in: new Date().toISOString(),
        gps_in: gpsData,
        gps_verified: true,
        status: "pending",
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
      entry: timeEntry,
      message: "Clocked in successfully",
      gps_verified: true,
      zone: {
        name: gpsVerification.zone_name,
        type: gpsVerification.zone_type,
      },
    });
  } catch (error: any) {
    console.error("Error in clock-in API:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}





















