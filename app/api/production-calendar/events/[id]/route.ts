// Block 90000 — Production Calendar API
// PATCH /api/production-calendar/events/[id] (update/reschedule event)
// DELETE /api/production-calendar/events/[id] (delete event)

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const {
      crew_id,
      start_time,
      end_time,
      status,
      title,
      description,
    } = body;

    // Get existing event
    const { data: existingEvent, error: fetchError } = await supabase
      .from("calendar_events")
      .select("*, workspace_id, crew_id, job_id")
      .eq("id", params.id)
      .single();

    if (fetchError || !existingEvent) {
      return NextResponse.json({ error: "Event not found" }, { status: 404 });
    }

    // Verify workspace membership
    const { data: membership } = await supabase
      .from("workspace_members")
      .select("workspace_id")
      .eq("workspace_id", existingEvent.workspace_id)
      .eq("user_id", user.id)
      .single();

    if (!membership) {
      return NextResponse.json({ error: "Access denied" }, { status: 403 });
    }

    // Check for conflicts if crew or time is changing
    const newCrewId = crew_id !== undefined ? crew_id : existingEvent.crew_id;
    const newStartTime = start_time !== undefined ? start_time : existingEvent.start_time;
    const newEndTime = end_time !== undefined ? end_time : existingEvent.end_time;

    if (newCrewId && (start_time !== undefined || end_time !== undefined)) {
      const { data: conflicts } = await supabase.rpc("check_scheduling_conflicts", {
        p_workspace_id: existingEvent.workspace_id,
        p_crew_id: newCrewId,
        p_start_time: newStartTime,
        p_end_time: newEndTime || newStartTime,
        p_job_id: existingEvent.job_id || null,
        p_event_id: params.id,
      });

      if (conflicts && conflicts.length > 0) {
        const criticalConflicts = conflicts.filter((c: any) => c.severity === "critical");
        if (criticalConflicts.length > 0) {
          return NextResponse.json(
            {
              error: "Scheduling conflict detected",
              conflicts: conflicts,
            },
            { status: 409 }
          );
        }
      }
    }

    // Update event
    const updateData: any = {};
    if (crew_id !== undefined) updateData.crew_id = crew_id;
    if (start_time !== undefined) updateData.start_time = start_time;
    if (end_time !== undefined) updateData.end_time = end_time;
    if (status !== undefined) updateData.status = status;
    if (title !== undefined) updateData.title = title;
    if (description !== undefined) updateData.description = description;

    const { data: updatedEvent, error } = await supabase
      .from("calendar_events")
      .update(updateData)
      .eq("id", params.id)
      .select()
      .single();

    if (error) throw error;

    // If rescheduled and job_id exists, notify homeowner
    if (
      (start_time !== undefined || end_time !== undefined) &&
      existingEvent.job_id &&
      existingEvent.event_type === "install"
    ) {
      fetch(`${req.nextUrl.origin}/api/production-calendar/notify-homeowner`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          job_id: existingEvent.job_id,
          event_id: params.id,
          event_type: "install_rescheduled",
          new_start_time: newStartTime,
        }),
      }).catch((err) => console.error("Failed to notify homeowner:", err));
    }

    return NextResponse.json({ event: updatedEvent });
  } catch (error: any) {
    console.error("Error updating production calendar event:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Get existing event
    const { data: existingEvent, error: fetchError } = await supabase
      .from("calendar_events")
      .select("workspace_id, job_id, event_type")
      .eq("id", params.id)
      .single();

    if (fetchError || !existingEvent) {
      return NextResponse.json({ error: "Event not found" }, { status: 404 });
    }

    // Verify workspace membership
    const { data: membership } = await supabase
      .from("workspace_members")
      .select("workspace_id")
      .eq("workspace_id", existingEvent.workspace_id)
      .eq("user_id", user.id)
      .single();

    if (!membership) {
      return NextResponse.json({ error: "Access denied" }, { status: 403 });
    }

    // Delete event
    const { error } = await supabase
      .from("calendar_events")
      .delete()
      .eq("id", params.id);

    if (error) throw error;

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("Error deleting production calendar event:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}



























