import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getCurrentWorkspaceId } from "@/lib/workspace";

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const workspaceId = await getCurrentWorkspaceId();
    if (!workspaceId) {
      return NextResponse.json({ error: "No workspace found" }, { status: 400 });
    }

    const { status } = await req.json();

    if (!status || !["open", "in_progress", "completed", "cancelled"].includes(status)) {
      return NextResponse.json(
        { error: "Invalid status" },
        { status: 400 }
      );
    }

    // Verify task belongs to workspace
    const { data: task, error: taskError } = await supabase
      .from("tasks")
      .select("id, workspace_id, status")
      .eq("id", params.id)
      .single();

    if (taskError || !task) {
      return NextResponse.json({ error: "Task not found" }, { status: 404 });
    }

    if (task.workspace_id !== workspaceId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    // Update task status
    const updateData: any = { status };
    if (status === "completed") {
      updateData.completed_at = new Date().toISOString();
    } else if (task.status === "completed" && status !== "completed") {
      // Reopening a completed task
      updateData.completed_at = null;
    }

    const { data: updatedTask, error: updateError } = await supabase
      .from("tasks")
      .update(updateData)
      .eq("id", params.id)
      .select("*")
      .single();

    if (updateError) {
      console.error("Error updating task:", updateError);
      return NextResponse.json(
        { error: updateError.message },
        { status: 500 }
      );
    }

    // Log activity feed entry
    try {
      await supabase.from("activity_feed").insert({
        workspace_id: workspaceId,
        type: "task_status_changed",
        metadata: {
          task_id: updatedTask.id,
          old_status: task.status,
          new_status: status,
        },
        created_by: user.id,
      });
    } catch (error) {
      // Don't fail if activity feed insert fails
      console.error("Error logging activity:", error);
    }

    return NextResponse.json({ task: updatedTask });
  } catch (error: any) {
    console.error("Error in PATCH /api/tasks/v2/[id]/status:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}



















































