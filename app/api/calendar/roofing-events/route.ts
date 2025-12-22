// Block 20800 — Roofing Calendar Sync v1
// POST /api/calendar/roofing-events
// Creates a roofing calendar event (install date, follow-up, etc.)

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";
import { getCurrentWorkspaceId } from "@/lib/workspace";

export async function POST(req: NextRequest) {
  try {
    const supabase = createClient();
    
    // Get current user
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    const body = await req.json();
    const {
      event_type,
      title,
      description,
      event_date,
      event_start_time,
      event_end_time,
      job_id,
      thread_id,
      lead_id,
      contact_id,
      metadata = {}
    } = body;

    // Validate required fields
    if (!event_type || !title || !event_date) {
      return NextResponse.json(
        { error: "event_type, title, and event_date are required" },
        { status: 400 }
      );
    }

    // Validate event_type
    const validEventTypes = ["ADJUSTER_APPT", "INSTALL_DATE", "FOLLOW_UP", "INSPECTION", "TASK"];
    if (!validEventTypes.includes(event_type)) {
      return NextResponse.json(
        { error: `event_type must be one of: ${validEventTypes.join(", ")}` },
        { status: 400 }
      );
    }

    // Get workspace ID
    const workspaceId = await getCurrentWorkspaceId();
    if (!workspaceId) {
      return NextResponse.json(
        { error: "Workspace not found" },
        { status: 404 }
      );
    }

    // Create calendar event using database function
    const { data: eventData, error: eventError } = await supabase.rpc(
      "create_calendar_event",
      {
        p_workspace_id: workspaceId,
        p_event_type: event_type,
        p_title: title,
        p_description: description || null,
        p_event_date: event_date,
        p_event_start_time: event_start_time || null,
        p_event_end_time: event_end_time || null,
        p_job_id: job_id || null,
        p_thread_id: thread_id || null,
        p_lead_id: lead_id || null,
        p_contact_id: contact_id || null,
        p_created_by: "user",
        p_created_by_user_id: user.id,
        p_metadata: metadata
      }
    );

    if (eventError) {
      console.error("[Calendar] Error creating event:", eventError);
      return NextResponse.json(
        { error: eventError.message || "Failed to create calendar event" },
        { status: 500 }
      );
    }

    // Fetch the created event with full details
    const { data: createdEvent, error: fetchError } = await supabase
      .from("calendar_events")
      .select("*")
      .eq("id", eventData)
      .single();

    if (fetchError || !createdEvent) {
      return NextResponse.json(
        { error: "Event created but failed to fetch details" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      event: createdEvent
    });
  } catch (error: any) {
    console.error("[Calendar] Unexpected error:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}
















































