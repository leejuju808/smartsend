// Block 20800 — Roofing Calendar Sync v1
// PATCH /api/calendar/roofing-events/[id]
// Updates a roofing calendar event
// DELETE /api/calendar/roofing-events/[id]
// Deletes a roofing calendar event

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";
import { getCurrentWorkspaceId } from "@/lib/workspace";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = createClient();
    const { id } = await params;
    
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
      title,
      description,
      event_date,
      event_start_time,
      event_end_time,
      status,
      metadata
    } = body;

    // Get workspace ID
    const workspaceId = await getCurrentWorkspaceId();
    if (!workspaceId) {
      return NextResponse.json(
        { error: "Workspace not found" },
        { status: 404 }
      );
    }

    // Verify event exists and user has access
    const { data: existingEvent, error: fetchError } = await supabase
      .from("calendar_events")
      .select("id, workspace_id")
      .eq("id", id)
      .single();

    if (fetchError || !existingEvent) {
      return NextResponse.json(
        { error: "Event not found" },
        { status: 404 }
      );
    }

    if (existingEvent.workspace_id !== workspaceId) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 403 }
      );
    }

    // Build update object
    const updates: any = {
      updated_at: new Date().toISOString()
    };

    if (title !== undefined) updates.title = title;
    if (description !== undefined) updates.description = description;
    if (event_date !== undefined) updates.event_date = event_date;
    if (event_start_time !== undefined) updates.event_start_time = event_start_time;
    if (event_end_time !== undefined) updates.event_end_time = event_end_time;
    if (status !== undefined) {
      updates.status = status;
      if (status === "completed") {
        updates.completed_at = new Date().toISOString();
      }
    }
    if (metadata !== undefined) updates.metadata = metadata;

    // Update event
    const { data: updatedEvent, error: updateError } = await supabase
      .from("calendar_events")
      .update(updates)
      .eq("id", id)
      .select()
      .single();

    if (updateError) {
      console.error("[Calendar] Error updating event:", updateError);
      return NextResponse.json(
        { error: updateError.message || "Failed to update calendar event" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      event: updatedEvent
    });
  } catch (error: any) {
    console.error("[Calendar] Unexpected error:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = createClient();
    const { id } = await params;
    
    // Get current user
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
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

    // Verify event exists and user has access
    const { data: existingEvent, error: fetchError } = await supabase
      .from("calendar_events")
      .select("id, workspace_id")
      .eq("id", id)
      .single();

    if (fetchError || !existingEvent) {
      return NextResponse.json(
        { error: "Event not found" },
        { status: 404 }
      );
    }

    if (existingEvent.workspace_id !== workspaceId) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 403 }
      );
    }

    // Delete event
    const { error: deleteError } = await supabase
      .from("calendar_events")
      .delete()
      .eq("id", id);

    if (deleteError) {
      console.error("[Calendar] Error deleting event:", deleteError);
      return NextResponse.json(
        { error: deleteError.message || "Failed to delete calendar event" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      message: "Event deleted successfully"
    });
  } catch (error: any) {
    console.error("[Calendar] Unexpected error:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}
















































