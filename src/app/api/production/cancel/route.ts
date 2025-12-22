// Block 224000 — SmartSend Roofing Production Calendar: Cancel Job
// POST /api/production/cancel
// Cancels a scheduled job

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST(req: NextRequest) {
  try {
    const supabase = createClient();

    // Ensure user is authenticated
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

    const { schedule_id, reason } = await req.json();

    if (!schedule_id) {
      return NextResponse.json(
        { error: "schedule_id is required" },
        { status: 400 }
      );
    }

    // Get user's workspaces
    const { data: memberships } = await supabase
      .from("workspace_members")
      .select("workspace_id")
      .eq("user_id", user.id);

    if (!memberships || memberships.length === 0) {
      return NextResponse.json(
        { error: "No workspace access" },
        { status: 403 }
      );
    }

    const workspaceIds = memberships.map((m) => m.workspace_id);

    // Get existing schedule
    const { data: schedule, error: scheduleError } = await supabase
      .from("job_schedule")
      .select("*, job_id, crew_id, workspace_id, company_id")
      .eq("id", schedule_id)
      .single();

    if (scheduleError || !schedule) {
      return NextResponse.json(
        { error: "Schedule not found" },
        { status: 404 }
      );
    }

    if (schedule.workspace_id && !workspaceIds.includes(schedule.workspace_id)) {
      return NextResponse.json(
        { error: "Access denied" },
        { status: 403 }
      );
    }

    // Update schedule status to canceled
    const { data: updated, error: updateError } = await supabase
      .from("job_schedule")
      .update({
        status: "canceled",
        notes: reason ? `Canceled: ${reason}` : schedule.notes,
        updated_at: new Date().toISOString(),
      })
      .eq("id", schedule_id)
      .select()
      .single();

    if (updateError) {
      return NextResponse.json(
        { error: "Failed to cancel job", details: updateError.message },
        { status: 500 }
      );
    }

    // Create schedule event
    await supabase.from("schedule_events").insert({
      job_id: schedule.job_id,
      job_schedule_id: schedule_id,
      workspace_id: schedule.workspace_id,
      company_id: schedule.company_id,
      event_type: "job_canceled",
      notes: reason || "Job canceled",
      metadata: {
        reason,
        canceled_at: new Date().toISOString(),
      },
    });

    return NextResponse.json({
      success: true,
      schedule: updated,
      message: "Job canceled successfully",
    });
  } catch (error: any) {
    console.error("Cancel job API error:", error);
    return NextResponse.json(
      { error: "Internal server error", message: error.message },
      { status: 500 }
    );
  }
}

























