// Block 16200 — Urgency Update Worker
// Updates task urgency based on storm risk, message tone, etc.

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function GET(req: NextRequest) {
  try {
    // Verify cron secret
    const authHeader = req.headers.get("authorization");
    const cronSecret = req.nextUrl.searchParams.get("key");
    
    if (cronSecret !== process.env.CRON_SECRET && !authHeader?.includes(process.env.CRON_SECRET || "")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Get all active tasks that need urgency recalculation
    const { data: tasks, error: fetchError } = await supabase
      .from("smartsend_tasks")
      .select("id, metadata, due_at, pipeline_stage_id")
      .neq("status", "completed")
      .is("completed_at", null);

    if (fetchError) {
      console.error("Error fetching tasks:", fetchError);
      return NextResponse.json(
        { error: fetchError.message, success: false },
        { status: 500 }
      );
    }

    let updated = 0;

    // Update urgency for each task
    for (const task of tasks || []) {
      const metadata = task.metadata || {};
      const stormRisk = metadata.storm_risk || 0;
      const hasUrgentLanguage = metadata.has_urgent_language || false;
      const insuranceTimelineDays = metadata.insurance_timeline_days || null;
      const missedAppointment = metadata.missed_appointment || false;
      
      // Calculate days since task was created (as proxy for stage sitting days)
      const daysSinceCreated = Math.floor(
        (new Date().getTime() - new Date(task.due_at).getTime()) / (1000 * 60 * 60 * 24)
      );
      const stageSittingDays = daysSinceCreated > 0 ? daysSinceCreated : null;

      // Calculate new urgency
      const { data: urgencyData, error: urgencyError } = await supabase.rpc(
        "calculate_task_urgency",
        {
          p_storm_risk: stormRisk,
          p_message_tone: metadata.message_tone || "neutral",
          p_has_urgent_language: hasUrgentLanguage,
          p_insurance_timeline_days: insuranceTimelineDays,
          p_missed_appointment: missedAppointment,
          p_stage_sitting_days: stageSittingDays,
        }
      );

      if (!urgencyError && urgencyData) {
        // Update task urgency
        const { error: updateError } = await supabase
          .from("smartsend_tasks")
          .update({ urgency: urgencyData })
          .eq("id", task.id);

        if (!updateError) {
          updated++;
        }
      }
    }

    return NextResponse.json({
      success: true,
      message: "Task urgency updated",
      updated,
      total: tasks?.length || 0,
    });
  } catch (error) {
    console.error("Error in urgency update worker:", error);
    return NextResponse.json(
      { error: "Internal server error", success: false },
      { status: 500 }
    );
  }
}





















































