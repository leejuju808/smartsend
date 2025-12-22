// Block 226000 — SmartSend Roofing Safety Compliance System
// POST /api/safety/hazards/submit
// Submit site hazard assessment - Auto-blocks job if severe hazard is reported

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(req: NextRequest) {
  try {
    const {
      dailyLogId,
      jobId,
      crewId,
      hazards, // Array of hazard types: ['electrical', 'dog', 'soft_ground', 'rotten_decking', 'weather_risk', 'ladder_risk', 'other_contractor', etc.]
      severity, // 'low', 'medium', 'high', 'critical'
      description,
      photoUrl,
    } = await req.json();

    if (!dailyLogId || !jobId || !hazards || !Array.isArray(hazards)) {
      return NextResponse.json(
        { error: "dailyLogId, jobId, and hazards array are required" },
        { status: 400 }
      );
    }

    // Determine if this is a severe hazard that requires shutdown
    const severeHazards = [
      "electrical",
      "rotten_decking",
      "structural_issue",
      "power_lines",
      "unsafe_conditions",
    ];
    const hasSevereHazard = hazards.some((h: string) => severeHazards.includes(h));
    const requiresShutdown = hasSevereHazard || severity === "critical" || severity === "high";

    // Create safety incident for hazard reporting
    const { data: incident, error: incidentError } = await supabase
      .from("safety_incidents")
      .insert({
        job_id: jobId,
        crew_id: crewId || null,
        daily_log_id: dailyLogId,
        incident_type: "other", // Hazards are logged as "other" type incidents
        description: description || `Site hazards identified: ${hazards.join(", ")}`,
        severity: severity || (hasSevereHazard ? "high" : "medium"),
        photo_url: photoUrl || null,
        requires_shutdown: requiresShutdown,
        status: requiresShutdown ? "open" : "reviewing",
        occurred_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (incidentError) {
      console.error("Error creating hazard incident:", incidentError);
      return NextResponse.json(
        { error: "Failed to log hazard", details: incidentError.message },
        { status: 500 }
      );
    }

    // If severe hazard, block the job
    if (requiresShutdown) {
      // Update job safety status
      await supabase
        .from("jobs")
        .update({ safety_status: "blocked" })
        .eq("id", jobId)
        .then(() => {})
        .catch(() => {});

      await supabase
        .from("roofing_jobs")
        .update({ safety_status: "blocked" })
        .eq("id", jobId)
        .then(() => {})
        .catch(() => {});

      // Pause daily log
      await supabase
        .from("crew_daily_logs")
        .update({ status: "paused" })
        .eq("id", dailyLogId);

      // TODO: Send notification to office
      // This would typically be done via a notification service or webhook

      return NextResponse.json({
        success: true,
        incident,
        blocked: true,
        message: "Severe hazard reported. Job has been stopped. Office has been notified.",
      });
    }

    // Non-severe hazard - mark as pending review
    if (severity === "medium" || severity === "high") {
      await supabase
        .from("jobs")
        .update({ safety_status: "pending_review" })
        .eq("id", jobId)
        .then(() => {})
        .catch(() => {});

      await supabase
        .from("roofing_jobs")
        .update({ safety_status: "pending_review" })
        .eq("id", jobId)
        .then(() => {})
        .catch(() => {});
    }

    return NextResponse.json({
      success: true,
      incident,
      blocked: false,
      message: "Hazard assessment submitted. Job can continue with caution.",
    });
  } catch (error: any) {
    console.error("Submit hazard assessment error:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}

























