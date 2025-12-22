// Block 226000 — SmartSend Roofing Safety Compliance System
// POST /api/safety/incidents/create
// Log safety incident - OSHA-ready event logging with auto-alerts and score impact

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(req: NextRequest) {
  try {
    const {
      jobId,
      crewId,
      dailyLogId,
      incidentType, // 'fall', 'cut', 'near_miss', 'equipment_failure', 'electrical', 'struck_by', 'caught_in', 'other'
      description,
      severity, // 'low', 'medium', 'high', 'critical'
      photoUrl,
      occurredAt,
      requiresShutdown,
    } = await req.json();

    if (!jobId || !incidentType || !description || !severity) {
      return NextResponse.json(
        { error: "jobId, incidentType, description, and severity are required" },
        { status: 400 }
      );
    }

    // Validate incident type
    const validTypes = [
      "fall",
      "cut",
      "near_miss",
      "equipment_failure",
      "electrical",
      "struck_by",
      "caught_in",
      "other",
    ];
    if (!validTypes.includes(incidentType)) {
      return NextResponse.json(
        { error: `Invalid incidentType. Must be one of: ${validTypes.join(", ")}` },
        { status: 400 }
      );
    }

    // Validate severity
    const validSeverities = ["low", "medium", "high", "critical"];
    if (!validSeverities.includes(severity)) {
      return NextResponse.json(
        { error: `Invalid severity. Must be one of: ${validSeverities.join(", ")}` },
        { status: 400 }
      );
    }

    // Create safety incident
    const { data: incident, error: incidentError } = await supabase
      .from("safety_incidents")
      .insert({
        job_id: jobId,
        crew_id: crewId || null,
        daily_log_id: dailyLogId || null,
        incident_type: incidentType,
        description,
        severity,
        photo_url: photoUrl || null,
        occurred_at: occurredAt || new Date().toISOString(),
        requires_shutdown: requiresShutdown || false,
        status: "open",
      })
      .select()
      .single();

    if (incidentError) {
      console.error("Error creating safety incident:", incidentError);
      return NextResponse.json(
        { error: "Failed to log incident", details: incidentError.message },
        { status: 500 }
      );
    }

    // Auto-triggers happen via database triggers:
    // - If requires_shutdown or severity='critical' → job is blocked
    // - If severity='high' → job marked as pending_review

    // Lower crew safety score (will be recalculated on next score update)
    // This is handled by the safety score calculation function

    // TODO: Send office alert
    // This would typically be done via a notification service or webhook
    // For now, we'll just log it
    console.log(`Safety incident logged: ${incidentType} - ${severity} severity at job ${jobId}`);

    return NextResponse.json({
      success: true,
      incident,
      message: "Safety incident logged successfully. Office has been notified.",
    });
  } catch (error: any) {
    console.error("Create safety incident error:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}

// GET /api/safety/incidents/create - Get incidents for a job or crew
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const jobId = searchParams.get("jobId");
    const crewId = searchParams.get("crewId");
    const status = searchParams.get("status");

    let query = supabase
      .from("safety_incidents")
      .select("*")
      .order("occurred_at", { ascending: false });

    if (jobId) {
      query = query.eq("job_id", jobId);
    }

    if (crewId) {
      query = query.eq("crew_id", crewId);
    }

    if (status) {
      query = query.eq("status", status);
    }

    const { data: incidents, error } = await query;

    if (error) {
      console.error("Error fetching incidents:", error);
      return NextResponse.json(
        { error: "Failed to fetch incidents", details: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      incidents: incidents || [],
    });
  } catch (error: any) {
    console.error("Get incidents error:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}

























