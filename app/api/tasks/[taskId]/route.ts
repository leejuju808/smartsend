// Block 25060 — SmartSend Roofing Task Manager v1 API
// Individual task operations (update, delete)

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ taskId: string }> }
) {
  try {
    const { taskId } = await params;
    const supabase = await createClient();

    const { data: task, error } = await supabase
      .from("roofing_tasks")
      .select(`
        *,
        job:roofing_jobs(id, title, job_value),
        lead:leads(id, email, first_name, last_name),
        assigned_user:profiles!roofing_tasks_assigned_user_id_fkey(id, name, email)
      `)
      .eq("id", taskId)
      .single();

    if (error) {
      console.error("Error fetching task:", error);
      return NextResponse.json(
        { error: "Task not found" },
        { status: 404 }
      );
    }

    return NextResponse.json({ task });
  } catch (error) {
    console.error("Error in GET /api/tasks/[taskId]:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ taskId: string }> }
) {
  try {
    const { taskId } = await params;
    const supabase = await createClient();
    const body = await req.json();

    const {
      title,
      description,
      priority,
      status,
      due_date,
      due_time,
      assigned_user_id,
      assigned_role,
      completion_action_type,
      completion_action_config,
      metadata,
    } = body;

    const updateData: any = {};

    if (title !== undefined) updateData.title = title;
    if (description !== undefined) updateData.description = description;
    if (priority !== undefined) updateData.priority = priority;
    if (status !== undefined) {
      updateData.status = status;
      if (status === "done") {
        updateData.completed_at = new Date().toISOString();
      }
    }
    if (due_date !== undefined) updateData.due_date = due_date;
    if (due_time !== undefined) updateData.due_time = due_time;
    if (assigned_user_id !== undefined) updateData.assigned_user_id = assigned_user_id;
    if (assigned_role !== undefined) updateData.assigned_role = assigned_role;
    if (completion_action_type !== undefined) updateData.completion_action_type = completion_action_type;
    if (completion_action_config !== undefined) updateData.completion_action_config = completion_action_config;
    if (metadata !== undefined) updateData.metadata = metadata;

    const { data: task, error } = await supabase
      .from("roofing_tasks")
      .update(updateData)
      .eq("id", taskId)
      .select(`
        *,
        job:roofing_jobs(id, title, job_value),
        lead:leads(id, email, first_name, last_name),
        assigned_user:profiles!roofing_tasks_assigned_user_id_fkey(id, name, email)
      `)
      .single();

    if (error) {
      console.error("Error updating task:", error);
      return NextResponse.json(
        { error: "Failed to update task" },
        { status: 500 }
      );
    }

    // Execute completion action if task was completed
    if (status === "done") {
      const { error: actionError } = await supabase.rpc("execute_task_completion_action", {
        p_task_id: taskId,
      });

      if (actionError) {
        console.error("Error executing completion action:", actionError);
      }
    }

    return NextResponse.json({ task });
  } catch (error) {
    console.error("Error in PATCH /api/tasks/[taskId]:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ taskId: string }> }
) {
  try {
    const { taskId } = await params;
    const supabase = await createClient();

    const { error } = await supabase
      .from("roofing_tasks")
      .delete()
      .eq("id", taskId);

    if (error) {
      console.error("Error deleting task:", error);
      return NextResponse.json(
        { error: "Failed to delete task" },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error in DELETE /api/tasks/[taskId]:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}






































