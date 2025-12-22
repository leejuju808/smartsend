// Block 225000 — SmartSend Roofing Crew App v1
// POST /api/crew/time/clock-out
// Clocks out worker and calculates total hours

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(req: NextRequest) {
  try {
    const { timeEntryId, workerName, dailyLogId } = await req.json();

    if (!timeEntryId && (!workerName || !dailyLogId)) {
      return NextResponse.json(
        { error: "Either timeEntryId or (workerName and dailyLogId) are required" },
        { status: 400 }
      );
    }

    // Find active time entry
    let query = supabase
      .from("crew_time_entries")
      .select("*")
      .is("clock_out", null);

    if (timeEntryId) {
      query = query.eq("id", timeEntryId);
    } else {
      query = query.eq("worker_name", workerName).eq("daily_log_id", dailyLogId);
    }

    const { data: timeEntry, error: findError } = await query.single();

    if (findError || !timeEntry) {
      return NextResponse.json(
        { error: "No active time entry found" },
        { status: 404 }
      );
    }

    // Clock out
    const clockOutTime = new Date().toISOString();
    const clockInTime = new Date(timeEntry.clock_in);
    const totalHours = (new Date(clockOutTime).getTime() - clockInTime.getTime()) / (1000 * 60 * 60);

    const { data: updatedEntry, error: updateError } = await supabase
      .from("crew_time_entries")
      .update({
        clock_out: clockOutTime,
        total_hours: totalHours,
      })
      .eq("id", timeEntry.id)
      .select()
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
      timeEntry: updatedEntry,
      message: `${timeEntry.worker_name} clocked out. Total hours: ${totalHours.toFixed(2)}`,
    });
  } catch (error: any) {
    console.error("Clock-out error:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}

























