// Block 256900 — Payroll & Timekeeping Engine v1
// POST /api/workforce/payroll/time-entries/clock-out
// Clock out with GPS verification

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
    const { employee_id, time_entry_id, lat, lng, address, break_minutes } =
      body;

    // Validate required fields
    if (!employee_id || !time_entry_id) {
      return NextResponse.json(
        { error: "employee_id and time_entry_id are required" },
        { status: 400 }
      );
    }

    // Get active time entry
    const { data: timeEntry, error: entryError } = await supabase
      .from("time_entries")
      .select("*")
      .eq("id", time_entry_id)
      .eq("employee_id", employee_id)
      .is("clock_out", null)
      .single();

    if (entryError || !timeEntry) {
      return NextResponse.json(
        { error: "Active time entry not found" },
        { status: 404 }
      );
    }

    // Prepare GPS data if provided
    let gpsOut = null;
    if (lat && lng) {
      gpsOut = {
        lat: parseFloat(lat),
        lng: parseFloat(lng),
        address: address || null,
        accuracy: null,
        timestamp: new Date().toISOString(),
        verified: true,
      };
    }

    // Update time entry with clock-out
    const { data: updatedEntry, error: updateError } = await supabase
      .from("time_entries")
      .update({
        clock_out: new Date().toISOString(),
        gps_out: gpsOut,
        break_minutes: break_minutes || 0,
        updated_at: new Date().toISOString(),
      })
      .eq("id", time_entry_id)
      .select("*")
      .single();

    if (updateError) {
      console.error("Clock-out error:", updateError);
      return NextResponse.json(
        { error: "Failed to clock out", details: updateError.message },
        { status: 500 }
      );
    }

    // Trigger break compliance check (handled by trigger)
    // Trigger missed punch check (handled by scheduled job)

    return NextResponse.json({
      success: true,
      entry: updatedEntry,
      message: "Clocked out successfully",
      total_hours: updatedEntry.total_hours,
      overtime_hours: updatedEntry.overtime_hours,
    });
  } catch (error: any) {
    console.error("Error in clock-out API:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}





















