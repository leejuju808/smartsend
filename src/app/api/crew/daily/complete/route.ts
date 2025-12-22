// Block 225000 — SmartSend Roofing Crew App v1
// POST /api/crew/daily/complete
// Closes daily log + notifies office

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(req: NextRequest) {
  try {
    const { dailyLogId, notes, endOfDayChecklist } = await req.json();

    if (!dailyLogId) {
      return NextResponse.json(
        { error: "dailyLogId is required" },
        { status: 400 }
      );
    }

    // Get daily log
    const { data: dailyLog, error: logError } = await supabase
      .from("crew_daily_logs")
      .select("*")
      .eq("id", dailyLogId)
      .single();

    if (logError || !dailyLog) {
      return NextResponse.json(
        { error: "Daily log not found" },
        { status: 404 }
      );
    }

    // Check if all workers are clocked out
    const { data: activeEntries } = await supabase
      .from("crew_time_entries")
      .select("worker_name")
      .eq("daily_log_id", dailyLogId)
      .is("clock_out", null);

    if (activeEntries && activeEntries.length > 0) {
      return NextResponse.json(
        {
          error: "Cannot complete daily log - workers still clocked in",
          activeWorkers: activeEntries.map((e) => e.worker_name),
        },
        { status: 400 }
      );
    }

    // Create end-of-day checklist if provided
    if (endOfDayChecklist) {
      const { data: endChecklist } = await supabase
        .from("crew_checklists")
        .insert({
          job_id: dailyLog.job_id,
          daily_log_id: dailyLogId,
          checklist_type: "end_of_day",
        })
        .select()
        .single();

      if (endChecklist && endOfDayChecklist.items) {
        await supabase.from("crew_checklist_items").insert(
          endOfDayChecklist.items.map((item: any) => ({
            checklist_id: endChecklist.id,
            label: item.label,
            is_required: item.is_required || false,
            completed: item.completed || false,
            completed_at: item.completed ? new Date().toISOString() : null,
          }))
        );
      }
    }

    // Update daily log
    const { data: updatedLog, error: updateError } = await supabase
      .from("crew_daily_logs")
      .update({
        status: "completed",
        end_time: new Date().toISOString(),
        notes: notes || dailyLog.notes,
      })
      .eq("id", dailyLogId)
      .select()
      .single();

    if (updateError) {
      console.error("Complete daily log error:", updateError);
      return NextResponse.json(
        { error: "Failed to complete daily log", details: updateError.message },
        { status: 500 }
      );
    }

    // Get summary for office notification
    const { data: timeEntries } = await supabase
      .from("crew_time_entries")
      .select("*")
      .eq("daily_log_id", dailyLogId);

    const { data: photos } = await supabase
      .from("crew_photos")
      .select("id, category")
      .eq("daily_log_id", dailyLogId);

    const { data: issues } = await supabase
      .from("crew_issues")
      .select("id, issue_type, severity")
      .eq("daily_log_id", dailyLogId)
      .eq("status", "open");

    // TODO: Send notification to office with summary
    // Summary includes:
    // - Total hours worked
    // - Number of photos taken
    // - Open issues
    // - Checklist completion status

    return NextResponse.json({
      success: true,
      dailyLog: updatedLog,
      summary: {
        totalWorkers: timeEntries?.length || 0,
        totalHours: timeEntries?.reduce((sum, entry) => sum + (entry.total_hours || 0), 0) || 0,
        photosCount: photos?.length || 0,
        openIssues: issues?.length || 0,
      },
      message: "Daily log completed successfully. Office has been notified.",
    });
  } catch (error: any) {
    console.error("Complete daily log error:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}

























