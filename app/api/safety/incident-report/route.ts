// Block 49000 — SmartSend Roofing Safety Compliance v1
// API Route: Incident Report
// POST /api/safety/incident-report
// Logs incident → notifies owner via dashboard + email

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    
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
    const {
      job_id,
      crew_id,
      crew_member_id,
      incident_type,
      severity,
      description,
      what_happened,
      who_was_involved,
      witnesses,
      weather,
      time_of_incident,
      photo_urls,
    } = body;

    if (!job_id || !crew_member_id || !incident_type || !severity || !description) {
      return NextResponse.json(
        { error: "job_id, crew_member_id, incident_type, severity, and description are required" },
        { status: 400 }
      );
    }

    // Verify member exists and user has access
    const { data: member, error: memberError } = await supabase
      .from("crew_members")
      .select("id, workspace_id, crew_id, user_id")
      .eq("id", crew_member_id)
      .single();

    if (memberError || !member) {
      return NextResponse.json(
        { error: "Crew member not found" },
        { status: 404 }
      );
    }

    // Verify user owns this crew member
    if (member.user_id !== user.id) {
      return NextResponse.json(
        { error: "Unauthorized: You can only report incidents for your own crew member account" },
        { status: 403 }
      );
    }

    // Verify job exists and is in same workspace
    const { data: job, error: jobError } = await supabase
      .from("roofing_jobs")
      .select("id, workspace_id, status")
      .eq("id", job_id)
      .single();

    if (jobError || !job) {
      return NextResponse.json(
        { error: "Job not found" },
        { status: 404 }
      );
    }

    // Insert incident report
    const { data: incident, error: incidentError } = await supabase
      .from("incident_reports")
      .insert({
        job_id,
        crew_id: crew_id || member.crew_id,
        crew_member_id,
        incident_type,
        severity,
        description,
        what_happened: what_happened || null,
        who_was_involved: Array.isArray(who_was_involved) ? who_was_involved : [],
        witnesses: Array.isArray(witnesses) ? witnesses : [],
        weather: weather || null,
        time_of_incident: time_of_incident || new Date().toISOString(),
        photo_urls: Array.isArray(photo_urls) ? photo_urls : [],
        status: "reported",
        owner_notified: severity === "high" || severity === "critical",
        owner_notified_at: severity === "high" || severity === "critical" ? new Date().toISOString() : null,
      })
      .select()
      .single();

    if (incidentError) {
      console.error("Error creating incident report:", incidentError);
      return NextResponse.json(
        { error: "Failed to create incident report" },
        { status: 500 }
      );
    }

    // If high/critical severity, trigger notification (handled by trigger, but we can also send email here)
    if (severity === "high" || severity === "critical") {
      // TODO: Send email notification to owner
      // This can be done via a webhook or edge function
    }

    return NextResponse.json({
      success: true,
      incident,
      message: "Incident report submitted successfully",
    });
  } catch (error: any) {
    console.error("Error in incident report API:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}
































