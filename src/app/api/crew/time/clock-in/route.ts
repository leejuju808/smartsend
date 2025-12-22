// Block 225000 — SmartSend Roofing Crew App v1
// POST /api/crew/time/clock-in
// Creates time entry for worker

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(req: NextRequest) {
  try {
    const { dailyLogId, jobId, workerName, crewMemberId } = await req.json();

    if (!dailyLogId || !jobId || !workerName) {
      return NextResponse.json(
        { error: "dailyLogId, jobId, and workerName are required" },
        { status: 400 }
      );
    }

    // Check if worker is already clocked in
    const { data: activeEntry } = await supabase
      .from("crew_time_entries")
      .select("id")
      .eq("daily_log_id", dailyLogId)
      .eq("worker_name", workerName)
      .is("clock_out", null)
      .single();

    if (activeEntry) {
      return NextResponse.json(
        { error: "Worker is already clocked in", timeEntryId: activeEntry.id },
        { status: 400 }
      );
    }

    // Create time entry
    const { data: timeEntry, error: entryError } = await supabase
      .from("crew_time_entries")
      .insert({
        daily_log_id: dailyLogId,
        job_id: jobId,
        crew_member_id: crewMemberId || null,
        worker_name: workerName,
        clock_in: new Date().toISOString(),
      })
      .select()
      .single();

    if (entryError) {
      console.error("Clock-in error:", entryError);
      return NextResponse.json(
        { error: "Failed to clock in", details: entryError.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      timeEntry,
      message: `${workerName} clocked in successfully`,
    });
  } catch (error: any) {
    console.error("Clock-in error:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}

























