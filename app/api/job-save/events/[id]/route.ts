// Block 22073 — SmartSend Roofing Job Save Engine v1
// API Route: Update Job Save Event
// PATCH /api/job-save/events/[id]

import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServer } from "@/lib/supabaseServer";
import { getCurrentWorkspaceId } from "@/lib/workspace";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = createSupabaseServer();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const workspaceId = await getCurrentWorkspaceId();
    if (!workspaceId) {
      return NextResponse.json({ error: "No workspace found" }, { status: 400 });
    }

    const { id } = await params;
    const body = await req.json();

    // Verify event belongs to workspace
    const { data: event, error: fetchError } = await supabase
      .from("job_save_events")
      .select("workspace_id")
      .eq("id", id)
      .single();

    if (fetchError || !event) {
      return NextResponse.json({ error: "Event not found" }, { status: 404 });
    }

    if (event.workspace_id !== workspaceId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    // Update event
    const updateData: any = {};
    if (body.status) updateData.status = body.status;
    if (body.status === "resolved" || body.status === "dismissed") {
      updateData.resolved_at = new Date().toISOString();
    }

    const { data: updatedEvent, error: updateError } = await supabase
      .from("job_save_events")
      .update(updateData)
      .eq("id", id)
      .select("*")
      .single();

    if (updateError) {
      console.error("Error updating job save event:", updateError);
      return NextResponse.json(
        { error: updateError.message },
        { status: 500 }
      );
    }

    return NextResponse.json({ event: updatedEvent });
  } catch (error: any) {
    console.error("Error in PATCH /api/job-save/events/[id]:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}









































