// Block 13300 — Calendar & Scheduling Sync v1
// PATCH /api/calendar/events/[id]
// Reschedule an event (inspection or task)

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";
import { getCurrentWorkspaceId } from "@/lib/workspace";
import { getCurrentOrgId } from "@/lib/org-helpers";

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
    const { start, end } = body;

    if (!start) {
      return NextResponse.json(
        { error: "start timestamp is required" },
        { status: 400 }
      );
    }

    // Parse event ID format: "inspection-{contactId}" or "task-{taskId}"
    const [eventType, entityId] = id.split("-", 2);

    if (!eventType || !entityId) {
      return NextResponse.json(
        { error: "Invalid event ID format" },
        { status: 400 }
      );
    }

    if (eventType === "inspection") {
      // Update inspection_at on contact
      const workspaceId = await getCurrentWorkspaceId();
      if (!workspaceId) {
        return NextResponse.json(
          { error: "Workspace not found" },
          { status: 404 }
        );
      }

      // Verify contact exists and belongs to workspace
      const { data: contact, error: contactError } = await supabase
        .from("contacts")
        .select("id, workspace_id")
        .eq("id", entityId)
        .eq("workspace_id", workspaceId)
        .single();

      if (contactError || !contact) {
        return NextResponse.json(
          { error: "Contact not found" },
          { status: 404 }
        );
      }

      // Update inspection_at
      const { data: updatedContact, error: updateError } = await supabase
        .from("contacts")
        .update({
          inspection_at: start,
          updated_at: new Date().toISOString(),
        })
        .eq("id", entityId)
        .select()
        .single();

      if (updateError) {
        console.error("[Calendar] Update inspection error:", updateError);
        return NextResponse.json(
          { error: "Failed to reschedule inspection" },
          { status: 500 }
        );
      }

      return NextResponse.json({
        success: true,
        event: {
          id: `inspection-${updatedContact.id}`,
          type: "inspection",
          start: updatedContact.inspection_at,
        },
      });
    } else if (eventType === "task") {
      // Update due_at on task
      const orgId = await getCurrentOrgId();
      if (!orgId) {
        return NextResponse.json(
          { error: "Organization not found" },
          { status: 404 }
        );
      }

      // Verify task exists and belongs to org
      const { data: task, error: taskError } = await supabase
        .from("tasks")
        .select("id, org_id")
        .eq("id", entityId)
        .eq("org_id", orgId)
        .single();

      if (taskError || !task) {
        return NextResponse.json(
          { error: "Task not found" },
          { status: 404 }
        );
      }

      // Update due_at (and due_date will be synced by trigger)
      const { data: updatedTask, error: updateError } = await supabase
        .from("tasks")
        .update({
          due_at: start,
          updated_at: new Date().toISOString(),
        })
        .eq("id", entityId)
        .select()
        .single();

      if (updateError) {
        console.error("[Calendar] Update task error:", updateError);
        return NextResponse.json(
          { error: "Failed to reschedule task" },
          { status: 500 }
        );
      }

      return NextResponse.json({
        success: true,
        event: {
          id: `task-${updatedTask.id}`,
          type: "task",
          start: updatedTask.due_at,
        },
      });
    } else {
      return NextResponse.json(
        { error: "Invalid event type" },
        { status: 400 }
      );
    }
  } catch (error: any) {
    console.error("[Calendar] Unexpected error:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}



























































