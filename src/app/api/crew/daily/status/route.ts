// Block 225000 — SmartSend Roofing Crew App v1
// GET /api/crew/daily/status?jobId=xxx&date=yyyy-mm-dd
// Gets daily log status, checklists, time entries, photos count, issues

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function GET(req: NextRequest) {
  try {
    const searchParams = req.nextUrl.searchParams;
    const jobId = searchParams.get("jobId");
    const date = searchParams.get("date") || new Date().toISOString().split("T")[0];

    if (!jobId) {
      return NextResponse.json(
        { error: "jobId is required" },
        { status: 400 }
      );
    }

    // Get daily log
    const { data: dailyLog } = await supabase
      .from("crew_daily_logs")
      .select("*")
      .eq("job_id", jobId)
      .eq("date", date)
      .single();

    if (!dailyLog) {
      return NextResponse.json({
        exists: false,
        status: "not_started",
      });
    }

    // Get checklists
    const { data: checklists } = await supabase
      .from("crew_checklists")
      .select(`
        *,
        items:crew_checklist_items(*)
      `)
      .eq("daily_log_id", dailyLog.id)
      .order("created_at", { ascending: true });

    // Get time entries
    const { data: timeEntries } = await supabase
      .from("crew_time_entries")
      .select("*")
      .eq("daily_log_id", dailyLog.id)
      .order("clock_in", { ascending: true });

    // Get photos count
    const { count: photosCount } = await supabase
      .from("crew_photos")
      .select("*", { count: "exact", head: true })
      .eq("daily_log_id", dailyLog.id);

    // Get issues
    const { data: issues } = await supabase
      .from("crew_issues")
      .select("*")
      .eq("daily_log_id", dailyLog.id)
      .order("created_at", { ascending: false });

    // Calculate total hours
    const totalHours = timeEntries?.reduce(
      (sum, entry) => sum + (entry.total_hours || 0),
      0
    ) || 0;

    // Check if materials verified
    const materialChecklist = checklists?.find(
      (c) => c.checklist_type === "material_verification"
    );
    const materialsVerified = materialChecklist?.completed || false;

    return NextResponse.json({
      exists: true,
      dailyLog,
      checklists: checklists || [],
      timeEntries: timeEntries || [],
      photosCount: photosCount || 0,
      issues: issues || [],
      totalHours: totalHours.toFixed(2),
      materialsVerified,
      canProceed: materialsVerified || dailyLog.status === "completed",
    });
  } catch (error: any) {
    console.error("Get daily status error:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}

























