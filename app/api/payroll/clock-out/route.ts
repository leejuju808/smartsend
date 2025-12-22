// Block 51000 — SmartSend Roofing Crew Payroll + Labor Cost Tracking System v1
// API Route: Clock Out
// POST /api/payroll/clock-out

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
    const { timecard_id, latitude, longitude, address } = body;

    if (!timecard_id) {
      return NextResponse.json(
        { error: "timecard_id is required" },
        { status: 400 }
      );
    }

    // Get timecard
    const { data: timecard, error: timecardError } = await supabase
      .from("timecards")
      .select("*")
      .eq("id", timecard_id)
      .single();

    if (timecardError || !timecard) {
      return NextResponse.json(
        { error: "Timecard not found", details: timecardError?.message },
        { status: 404 }
      );
    }

    // Prepare GPS out data
    let gps_out = null;
    if (latitude && longitude) {
      gps_out = {
        lat: latitude,
        lng: longitude,
        address: address || null,
        accuracy: null,
        timestamp: new Date().toISOString(),
      };
    }

    // Update timecard with clock-out
    // The trigger will automatically calculate hours, overtime, and pay
    const { data, error } = await supabase
      .from("timecards")
      .update({
        clock_out: new Date().toISOString(),
        gps_out,
        status: "completed",
        updated_at: new Date().toISOString(),
      })
      .eq("id", timecard_id)
      .select()
      .single();

    if (error) {
      return NextResponse.json(
        { error: "Failed to clock out", details: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      timecard: data,
      message: "Clock-out successful",
      total_hours: data.total_hours,
      overtime_hours: data.overtime_hours,
      total_pay: data.total_pay,
    });
  } catch (error: any) {
    console.error("Error in clock-out API:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}
































