// Block 246000 — Log Production Event API
// POST /api/production/event

import { NextRequest, NextResponse } from "next/server";
import { getServerSupabase } from "@/lib/supabase/server";
import { getActiveWorkspaceId } from "@/lib/workspace/context";

export async function POST(req: NextRequest) {
  try {
    const supabase = getServerSupabase();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const workspaceId = await getActiveWorkspaceId();
    if (!workspaceId) {
      return NextResponse.json({ error: "No workspace found" }, { status: 400 });
    }

    const {
      job_id,
      crew_id,
      event_type,
      message,
      details,
    } = await req.json();

    if (!event_type) {
      return NextResponse.json(
        { error: "event_type is required" },
        { status: 400 }
      );
    }

    // Validate event_type
    const validEventTypes = [
      "job_started",
      "job_delayed",
      "job_resumed",
      "job_completed",
      "job_inspected",
      "crew_assigned",
      "crew_arrived",
      "crew_departed",
      "crew_clock_in",
      "crew_clock_out",
      "material_ordered",
      "material_delivered",
      "material_verified",
      "material_shortage",
      "issue_reported",
      "issue_resolved",
      "change_order_created",
      "change_order_approved",
      "inspection_scheduled",
      "inspection_completed",
      "payment_received",
      "customer_contacted",
      "weather_alert",
      "safety_incident",
      "equipment_issue",
      "schedule_updated",
      "other",
    ];

    if (!validEventTypes.includes(event_type)) {
      return NextResponse.json(
        { error: `Invalid event_type. Must be one of: ${validEventTypes.join(", ")}` },
        { status: 400 }
      );
    }

    // Create production event
    const { data: event, error: eventError } = await supabase
      .from("production_events")
      .insert({
        workspace_id: workspaceId,
        job_id: job_id || null,
        crew_id: crew_id || null,
        user_id: user.id,
        event_type,
        message: message || undefined,
        details: details || {},
      })
      .select()
      .single();

    if (eventError) {
      console.error("Error creating event:", eventError);
      return NextResponse.json({ error: eventError.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, event });
  } catch (error: any) {
    console.error("Error in POST /api/production/event:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}

























