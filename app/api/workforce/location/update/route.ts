// Block 253500 — Jobsite Live View Engine
// POST /api/workforce/location/update
// Updates employee GPS location and triggers auto-arrival detection

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
    const { 
      employee_id, 
      lat, 
      lng, 
      accuracy, 
      heading, 
      speed,
      recorded_at 
    } = body;

    // Validate required fields
    if (!employee_id || lat === undefined || lng === undefined) {
      return NextResponse.json(
        { error: "employee_id, lat, and lng are required" },
        { status: 400 }
      );
    }

    // Verify employee exists and user has access
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

    // Insert location log
    const { data: locationLog, error: locationError } = await supabase
      .from("employee_location_logs")
      .insert({
        employee_id,
        lat: parseFloat(lat),
        lng: parseFloat(lng),
        accuracy: accuracy ? parseFloat(accuracy) : null,
        heading: heading ? parseFloat(heading) : null,
        speed: speed ? parseFloat(speed) : null,
        recorded_at: recorded_at || new Date().toISOString(),
      })
      .select()
      .single();

    if (locationError) {
      console.error("Error inserting location log:", locationError);
      return NextResponse.json(
        { error: "Failed to update location" },
        { status: 500 }
      );
    }

    // Trigger arrival/departure detection
    // The database trigger will handle this automatically, but we can also call it explicitly
    const { data: arrivalResult } = await supabase.rpc("detect_job_arrival", {
      p_employee_id: employee_id,
      p_lat: parseFloat(lat),
      p_lng: parseFloat(lng),
      p_recorded_at: recorded_at || new Date().toISOString(),
    });

    const { data: departureResult } = await supabase.rpc("detect_job_departure", {
      p_employee_id: employee_id,
      p_lat: parseFloat(lat),
      p_lng: parseFloat(lng),
      p_recorded_at: recorded_at || new Date().toISOString(),
    });

    // If arrival detected, send alert
    if (arrivalResult && arrivalResult.action === "arrived") {
      // Get job details for alert
      const { data: job } = await supabase
        .from("jobs")
        .select("id, notes, address")
        .eq("id", arrivalResult.job_id)
        .single();

      const { data: employeeInfo } = await supabase
        .from("workforce_employees")
        .select("first_name, last_name")
        .eq("id", employee_id)
        .single();

      if (job && employeeInfo) {
        // Send alert via alerts API
        try {
          await fetch(`${req.nextUrl.origin}/api/alerts/send`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              type: "system_billing", // Using existing type, could add new type
              title: "Crew Arrived at Job",
              message: `${employeeInfo.first_name} ${employeeInfo.last_name} arrived at ${job.notes || job.address || `Job #${job.id.slice(0, 8)}`}`,
              metadata: {
                employee_id,
                job_id: arrivalResult.job_id,
                visit_id: arrivalResult.visit_id,
                arrived_at: arrivalResult.arrived_at,
              },
              source: "jobsite_live_view",
            }),
          });
        } catch (alertError) {
          console.error("Failed to send arrival alert:", alertError);
          // Don't fail the request if alert fails
        }
      }
    }

    // If departure detected, send alert
    if (departureResult && departureResult.action === "departed") {
      const { data: job } = await supabase
        .from("jobs")
        .select("id, notes, address")
        .eq("id", departureResult.job_id)
        .single();

      const { data: employeeInfo } = await supabase
        .from("workforce_employees")
        .select("first_name, last_name")
        .eq("id", employee_id)
        .single();

      if (job && employeeInfo) {
        try {
          await fetch(`${req.nextUrl.origin}/api/alerts/send`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              type: "system_billing",
              title: "Crew Left Job",
              message: `${employeeInfo.first_name} ${employeeInfo.last_name} left ${job.notes || job.address || `Job #${job.id.slice(0, 8)}`}`,
              metadata: {
                employee_id,
                job_id: departureResult.job_id,
                visit_id: departureResult.visit_id,
                left_at: departureResult.left_at,
              },
              source: "jobsite_live_view",
            }),
          });
        } catch (alertError) {
          console.error("Failed to send departure alert:", alertError);
        }
      }
    }

    return NextResponse.json({
      success: true,
      location_log_id: locationLog.id,
      arrival: arrivalResult,
      departure: departureResult,
    });
  } catch (error: any) {
    console.error("Error in location update:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}
























