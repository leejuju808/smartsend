// Block 225000 — SmartSend Roofing Crew App v1
// POST /api/crew/daily/start
// Creates crew_daily_logs, auto-assigns checklists, sets status = in_progress

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(req: NextRequest) {
  try {
    const { jobId, crewId, notes, weatherConditions } = await req.json();

    if (!jobId || !crewId) {
      return NextResponse.json(
        { error: "jobId and crewId are required" },
        { status: 400 }
      );
    }

    // Check if daily log already exists for today
    const today = new Date().toISOString().split("T")[0];
    
    const { data: existingLog } = await supabase
      .from("crew_daily_logs")
      .select("id, status")
      .eq("job_id", jobId)
      .eq("date", today)
      .single();

    if (existingLog) {
      // Update existing log if not already in progress
      if (existingLog.status !== "in_progress") {
        const { data: updatedLog, error: updateError } = await supabase
          .from("crew_daily_logs")
          .update({
            status: "in_progress",
            start_time: new Date().toISOString(),
            notes: notes || existingLog.notes,
            weather_conditions: weatherConditions,
          })
          .eq("id", existingLog.id)
          .select()
          .single();

        if (updateError) {
          return NextResponse.json(
            { error: "Failed to start daily log", details: updateError.message },
            { status: 500 }
          );
        }

        return NextResponse.json({
          success: true,
          dailyLog: updatedLog,
          message: "Daily log resumed",
        });
      } else {
        return NextResponse.json({
          success: true,
          dailyLog: existingLog,
          message: "Daily log already in progress",
        });
      }
    }

    // Create new daily log
    const { data: dailyLog, error: logError } = await supabase
      .from("crew_daily_logs")
      .insert({
        job_id: jobId,
        crew_id: crewId,
        date: today,
        status: "in_progress",
        start_time: new Date().toISOString(),
        notes: notes,
        weather_conditions: weatherConditions,
      })
      .select()
      .single();

    if (logError) {
      console.error("Daily log creation error:", logError);
      return NextResponse.json(
        { error: "Failed to create daily log", details: logError.message },
        { status: 500 }
      );
    }

    // The trigger will auto-create the start-of-day checklist
    // But let's also create material verification checklist
    const { data: materialChecklist } = await supabase
      .from("crew_checklists")
      .insert({
        job_id: jobId,
        daily_log_id: dailyLog.id,
        checklist_type: "material_verification",
      })
      .select()
      .single();

    if (materialChecklist) {
      // Add material verification items
      await supabase.from("crew_checklist_items").insert([
        {
          checklist_id: materialChecklist.id,
          label: "Verify all materials delivered",
          is_required: true,
        },
        {
          checklist_id: materialChecklist.id,
          label: "Check material quantities match order",
          is_required: true,
        },
        {
          checklist_id: materialChecklist.id,
          label: "Inspect materials for damage",
          is_required: true,
        },
      ]);
    }

    // Block 226000: Auto-generate safety checklist
    // Get job details for safety checklist generation
    const { data: jobData } = await supabase
      .from("jobs")
      .select("id, roof_pitch, estimated_height, address")
      .eq("id", jobId)
      .single()
      .catch(async () => {
        // Fallback to roofing_jobs
        return await supabase
          .from("roofing_jobs")
          .select("id, roof_pitch, estimated_height, address")
          .eq("id", jobId)
          .single();
      });

    // Generate safety checklist
    try {
      const safetyChecklistResponse = await fetch(
        `${process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"}/api/safety/checklist/generate`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            dailyLogId: dailyLog.id,
            jobId,
            crewId,
            roofPitch: jobData?.data?.roof_pitch || null,
            jobHeight: jobData?.data?.estimated_height || null,
            weatherCondition: weatherConditions || null,
            crewSize: null, // Could be passed if available
          }),
        }
      );

      if (safetyChecklistResponse.ok) {
        const safetyData = await safetyChecklistResponse.json();
        console.log("Safety checklist auto-generated:", safetyData.checklist?.id);
      }
    } catch (error) {
      console.error("Error generating safety checklist:", error);
      // Don't fail the daily log creation if safety checklist generation fails
    }

    // Check if materials are verified before allowing job start
    // This is a blocking check - job cannot proceed without material verification
    const { data: materialChecklistData } = await supabase
      .from("crew_checklists")
      .select(`
        id,
        completed,
        items:crew_checklist_items!inner(is_required, completed)
      `)
      .eq("daily_log_id", dailyLog.id)
      .eq("checklist_type", "material_verification")
      .single();

    const materialsVerified = materialChecklistData?.completed || false;

    return NextResponse.json({
      success: true,
      dailyLog,
      materialsVerified,
      requiresMaterialVerification: !materialsVerified,
      requiresSafetyChecklist: true, // Block 226000: Safety checklist is now required
      message: materialsVerified
        ? "Daily log started. Complete safety checklist before starting work."
        : "Daily log started. Please verify materials and complete safety checklist before proceeding.",
    });
  } catch (error: any) {
    console.error("Start daily log error:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}
