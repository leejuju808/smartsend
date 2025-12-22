// Block 21900 — SmartSend Roofing Action Queue Task Update API v1
// PATCH /api/action-queue/[id] - Update task status (mark done/skipped/in_progress)

import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServer } from "@/lib/supabaseServer";
import { getCurrentWorkspaceId } from "@/lib/workspace";

/**
 * PATCH /api/action-queue/[id]
 * Update action queue task status
 * 
 * Body:
 * - status: 'open' | 'in_progress' | 'done' | 'skipped'
 */
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
    const { status } = body;

    if (!status || !["open", "in_progress", "done", "skipped"].includes(status)) {
      return NextResponse.json(
        { error: "Invalid status. Must be: open, in_progress, done, or skipped" },
        { status: 400 }
      );
    }

    // Verify task exists and belongs to workspace
    const { data: existingTask, error: fetchError } = await supabase
      .from("action_queue_tasks")
      .select("id, workspace_id, assigned_user_id")
      .eq("id", id)
      .eq("workspace_id", workspaceId)
      .single();

    if (fetchError || !existingTask) {
      return NextResponse.json(
        { error: "Task not found" },
        { status: 404 }
      );
    }

    // Verify user has permission (assigned to them or workspace member)
    if (existingTask.assigned_user_id !== user.id) {
      // Check if user is workspace member
      const { data: member } = await supabase
        .from("workspace_members")
        .select("user_id")
        .eq("workspace_id", workspaceId)
        .eq("user_id", user.id)
        .single();

      if (!member) {
        return NextResponse.json(
          { error: "Not authorized to update this task" },
          { status: 403 }
        );
      }
    }

    // Update task
    const updateData: any = {
      status,
      updated_at: new Date().toISOString(),
    };

    if (status === "done") {
      updateData.completed_at = new Date().toISOString();
    } else if (status === "open" && existingTask.status === "done") {
      updateData.completed_at = null;
    }

    const { data: updatedTask, error: updateError } = await supabase
      .from("action_queue_tasks")
      .update(updateData)
      .eq("id", id)
      .select()
      .single();

    if (updateError) {
      console.error("Error updating task:", updateError);
      return NextResponse.json(
        { error: updateError.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      ok: true,
      task: updatedTask,
    });
  } catch (error: any) {
    console.error("Error in action queue PATCH:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}









































