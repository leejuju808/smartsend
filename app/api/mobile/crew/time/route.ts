// Block 238000 — SmartSend Mobile App v1
// POST /api/mobile/crew/time
// Clock in/out for crew members

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST(req: NextRequest) {
  try {
    const supabase = createClient();

    // Authenticate user
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
    const { action, job_id, crew_id, location, notes } = body; // action: 'clock_in' | 'clock_out'

    if (!action || (action !== "clock_in" && action !== "clock_out")) {
      return NextResponse.json(
        { error: "action must be 'clock_in' or 'clock_out'" },
        { status: 400 }
      );
    }

    if (!job_id) {
      return NextResponse.json(
        { error: "job_id is required" },
        { status: 400 }
      );
    }

    const timestamp = new Date().toISOString();

    // Check if user is a crew member
    const { data: crewMember } = await supabase
      .from("crew_members")
      .select("id, crew_id, name")
      .eq("user_id", user.id)
      .eq("is_active", true)
      .single();

    if (!crewMember) {
      return NextResponse.json(
        { error: "User is not an active crew member" },
        { status: 403 }
      );
    }

    if (action === "clock_in") {
      // Check if already clocked in
      const { data: existingClock } = await supabase
        .from("crew_time_logs")
        .select("id")
        .eq("user_id", user.id)
        .eq("job_id", job_id)
        .is("clock_out_at", null)
        .single();

      if (existingClock) {
        return NextResponse.json(
          { error: "Already clocked in for this job" },
          { status: 400 }
        );
      }

      // Clock in
      const { data: timeLog, error: insertError } = await supabase
        .from("crew_time_logs")
        .insert({
          user_id: user.id,
          job_id,
          crew_id: crew_id || crewMember.crew_id,
          clock_in_at: timestamp,
          clock_in_location: location || null,
          notes: notes || null,
        })
        .select()
        .single();

      if (insertError) {
        console.error("Clock in error:", insertError);
        return NextResponse.json(
          { error: "Failed to clock in", details: insertError.message },
          { status: 500 }
        );
      }

      return NextResponse.json({
        success: true,
        action: "clock_in",
        time_log: timeLog,
      });
    } else {
      // Clock out
      const { data: existingClock, error: findError } = await supabase
        .from("crew_time_logs")
        .select("id, clock_in_at")
        .eq("user_id", user.id)
        .eq("job_id", job_id)
        .is("clock_out_at", null)
        .order("clock_in_at", { ascending: false })
        .limit(1)
        .single();

      if (findError || !existingClock) {
        return NextResponse.json(
          { error: "No active clock-in found for this job" },
          { status: 400 }
        );
      }

      // Calculate hours worked
      const clockIn = new Date(existingClock.clock_in_at);
      const clockOut = new Date(timestamp);
      const hoursWorked = (clockOut.getTime() - clockIn.getTime()) / (1000 * 60 * 60);

      const { data: timeLog, error: updateError } = await supabase
        .from("crew_time_logs")
        .update({
          clock_out_at: timestamp,
          clock_out_location: location || null,
          hours_worked: hoursWorked,
          notes: notes || null,
        })
        .eq("id", existingClock.id)
        .select()
        .single();

      if (updateError) {
        console.error("Clock out error:", updateError);
        return NextResponse.json(
          { error: "Failed to clock out", details: updateError.message },
          { status: 500 }
        );
      }

      return NextResponse.json({
        success: true,
        action: "clock_out",
        time_log: timeLog,
        hours_worked: hoursWorked,
      });
    }
  } catch (error: any) {
    console.error("Error in crew time API:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}

// GET /api/mobile/crew/time?job_id=xxx
// Get time logs for a job
export async function GET(req: NextRequest) {
  try {
    const supabase = createClient();

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

    const url = new URL(req.url);
    const jobId = url.searchParams.get("job_id");

    if (!jobId) {
      return NextResponse.json(
        { error: "job_id is required" },
        { status: 400 }
      );
    }

    const { data: timeLogs, error } = await supabase
      .from("crew_time_logs")
      .select("*")
      .eq("job_id", jobId)
      .order("clock_in_at", { ascending: false });

    if (error) {
      return NextResponse.json(
        { error: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      time_logs: timeLogs || [],
    });
  } catch (error: any) {
    console.error("Error fetching time logs:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}

























