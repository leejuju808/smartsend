// Block 16200 — SmartSend Tasks & Follow-Up Board v1
// Task update and delete endpoints

import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServer } from "@/lib/supabaseServer";
import { getCurrentOrgId } from "@/lib/org-helpers";
import { getCurrentWorkspaceId } from "@/lib/workspace";
import { TaskV2, TaskStatus, TaskUrgency, TaskType } from "../route";

export type UpdateTaskInput = {
  status?: TaskStatus;
  urgency?: TaskUrgency;
  taskType?: TaskType;
  title?: string;
  description?: string;
  notes?: string;
  dueAt?: string;
  assignedTo?: string;
  completed?: boolean;
  metadata?: Record<string, any>;
  nextStepSuggestion?: string;
};

/**
 * PATCH /api/tasks/v2/[id]
 * Update a task
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

    const { id } = await params;
    const body = (await req.json()) as UpdateTaskInput;

    // Get workspace_id and org_id
    const workspaceId = await getCurrentWorkspaceId();
    const orgId = await getCurrentOrgId();

    // Verify task exists and user has access
    const { data: existingTask, error: fetchError } = await supabase
      .from("tasks")
      .select("*")
      .eq("id", id)
      .single();

    if (fetchError || !existingTask) {
      return NextResponse.json({ error: "Task not found" }, { status: 404 });
    }

    // Check access
    if (existingTask.workspace_id && existingTask.workspace_id !== workspaceId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }
    if (existingTask.org_id && existingTask.org_id !== orgId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    // Build update object
    const updateData: any = {};

    if (body.status !== undefined) {
      updateData.status = body.status;
    }
    if (body.urgency !== undefined) {
      updateData.urgency = body.urgency;
    }
    if (body.taskType !== undefined) {
      updateData.task_type = body.taskType;
    }
    if (body.title !== undefined) {
      updateData.title = body.title;
    }
    if (body.description !== undefined) {
      updateData.description = body.description;
    }
    if (body.notes !== undefined) {
      updateData.notes = body.notes;
    }
    if (body.dueAt !== undefined) {
      updateData.due_at = body.dueAt;
      
      // Update status based on new due date if not explicitly set
      if (body.status === undefined) {
        const dueDate = new Date(body.dueAt);
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const dueDateOnly = new Date(dueDate);
        dueDateOnly.setHours(0, 0, 0, 0);

        if (dueDateOnly.getTime() === today.getTime()) {
          updateData.status = 'today';
        } else if (dueDate < today) {
          updateData.status = 'today';
        } else if (dueDate.getTime() - today.getTime() > 7 * 24 * 60 * 60 * 1000) {
          updateData.status = 'waiting_on_homeowner';
        } else {
          updateData.status = 'upcoming';
        }
      }
    }
    if (body.assignedTo !== undefined) {
      updateData.assigned_to = body.assignedTo;
      updateData.user_id = body.assignedTo;
    }
    if (body.completed !== undefined) {
      updateData.completed = body.completed;
      if (body.completed) {
        updateData.completed_at = new Date().toISOString();
        updateData.status = 'completed';
      } else {
        updateData.completed_at = null;
        // Reset status based on due date
        const dueDate = new Date(existingTask.due_at);
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const dueDateOnly = new Date(dueDate);
        dueDateOnly.setHours(0, 0, 0, 0);

        if (dueDateOnly.getTime() === today.getTime()) {
          updateData.status = 'today';
        } else if (dueDate < today) {
          updateData.status = 'today';
        } else if (dueDate.getTime() - today.getTime() > 7 * 24 * 60 * 60 * 1000) {
          updateData.status = 'waiting_on_homeowner';
        } else {
          updateData.status = 'upcoming';
        }
      }
    }
    if (body.metadata !== undefined) {
      updateData.metadata = body.metadata;
    }
    if (body.nextStepSuggestion !== undefined) {
      updateData.next_step_suggestion = body.nextStepSuggestion;
    }

    // Update task
    const { data: task, error } = await supabase
      .from("tasks")
      .update(updateData)
      .eq("id", id)
      .select("*")
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Transform to API format
    const transformed: TaskV2 = {
      id: task.id,
      workspaceId: task.workspace_id || task.org_id,
      orgId: task.org_id,
      contactId: task.contact_id || undefined,
      companyId: task.company_id || undefined,
      leadId: task.lead_id || undefined,
      replyThreadId: task.reply_thread_id || undefined,
      campaignId: task.campaign_id || undefined,
      assignedTo: task.assigned_to,
      taskType: task.task_type || 'follow_up_needed',
      urgency: task.urgency || 'normal',
      status: task.status || (task.completed ? 'completed' : 'today'),
      title: task.title,
      description: task.description || undefined,
      notes: task.notes || undefined,
      dueAt: task.due_at,
      completed: task.completed || false,
      completedAt: task.completed_at || undefined,
      createdAt: task.created_at,
      updatedAt: task.updated_at,
      autoGenerated: task.auto_generated || false,
      autoType: task.auto_type || undefined,
      createdBy: task.created_by || undefined,
      metadata: task.metadata || {},
      nextStepSuggestion: task.next_step_suggestion || undefined,
      followUpCycleCount: task.follow_up_cycle_count || 0,
      followUpCycleType: task.follow_up_cycle_type || undefined,
      lastMessageSnippet: task.last_message_snippet || undefined,
    };

    return NextResponse.json({ data: transformed });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/tasks/v2/[id]
 * Delete a task
 */
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = createSupabaseServer();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;

    // Get workspace_id and org_id
    const workspaceId = await getCurrentWorkspaceId();
    const orgId = await getCurrentOrgId();

    // Verify task exists and user has access
    const { data: existingTask, error: fetchError } = await supabase
      .from("tasks")
      .select("*")
      .eq("id", id)
      .single();

    if (fetchError || !existingTask) {
      return NextResponse.json({ error: "Task not found" }, { status: 404 });
    }

    // Check access
    if (existingTask.workspace_id && existingTask.workspace_id !== workspaceId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }
    if (existingTask.org_id && existingTask.org_id !== orgId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    // Delete task
    const { error } = await supabase
      .from("tasks")
      .delete()
      .eq("id", id);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}





















































