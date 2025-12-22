import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServer } from "@/lib/supabaseServer";
import { getCurrentOrgId } from "@/lib/org-helpers";
import { Task } from "../route";
import { logTaskCompleted, logTaskAssigned } from "@/lib/contactActivity";

export type UpdateTaskInput = {
  title?: string;
  description?: string; // Roofing-specific
  notes?: string;
  dueAt?: string;
  assignedTo?: string;
  priority?: 'low' | 'medium' | 'high';
  status?: 'open' | 'completed';
  completed?: boolean;
  type?: 'call' | 'text' | 'email' | 'inspection' | 'follow_up' | 'send_estimate' | 're_engage' | 'answer_question' | 'review_damage' | 'insurance_support';
};

/**
 * PATCH /api/tasks/[id]
 * Body: UpdateTaskInput (partial)
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = createSupabaseServer();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = (await req.json()) as UpdateTaskInput;
    const taskId = params.id;

    // Get current org_id
    const orgId = await getCurrentOrgId();
    if (!orgId) {
      return NextResponse.json({ error: "No organization found" }, { status: 400 });
    }

    // Build update object
    const updateData: any = {};
    if (body.title !== undefined) updateData.title = body.title;
    if (body.description !== undefined) updateData.description = body.description; // Roofing-specific
    if (body.notes !== undefined) updateData.notes = body.notes;
    if (body.dueAt !== undefined) updateData.due_at = body.dueAt;
    if (body.assignedTo !== undefined) updateData.assigned_to = body.assignedTo || null;
    if (body.priority !== undefined) updateData.priority = body.priority;
    if (body.type !== undefined) updateData.type = body.type; // Roofing-specific
    if (body.status !== undefined) {
      updateData.status = body.status;
      updateData.completed = body.status === 'completed';
      if (body.status === 'completed') {
        updateData.completed_at = new Date().toISOString();
      } else {
        updateData.completed_at = null;
      }
    } else if (body.completed !== undefined) {
      updateData.completed = body.completed;
      updateData.status = body.completed ? 'completed' : 'open';
      if (body.completed) {
        updateData.completed_at = new Date().toISOString();
      } else {
        updateData.completed_at = null;
      }
    }

    // Update task
    const { data: task, error } = await supabase
      .from("tasks")
      .update(updateData)
      .eq("id", taskId)
      .eq("org_id", orgId)
      .select("*")
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    if (!task) {
      return NextResponse.json({ error: "Task not found" }, { status: 404 });
    }

    // Log activity timeline events
    if (task.contact_id) {
      try {
        // Log assignment change if assigned_to changed
        if (body.assignedTo !== undefined && body.assignedTo !== task.assigned_to) {
          await logTaskAssigned(orgId, task.contact_id, {
            taskId: task.id,
            title: task.title,
            assignedTo: body.assignedTo || task.assigned_to || "",
          });

          // Create notification for new assignee
          if (body.assignedTo && body.assignedTo !== user.id) {
            await supabase.rpc("create_task_assigned_notification", {
              p_org_id: orgId,
              p_user_id: body.assignedTo,
              p_task_id: task.id,
              p_contact_id: task.contact_id,
            });
          }
        }

        // Log completion if status changed to completed
        if (
          (body.status === "completed" || body.completed === true) &&
          !task.completed
        ) {
          await logTaskCompleted(orgId, task.contact_id, {
            taskId: task.id,
            title: task.title,
            userId: user.id,
          });

          // Notify original assigner if different from completer
          if (task.created_by && task.created_by !== user.id) {
            await supabase.rpc("create_task_completed_notification", {
              p_org_id: orgId,
              p_user_id: task.created_by,
              p_task_id: task.id,
              p_contact_id: task.contact_id,
            });
          }
        }
      } catch (err) {
        console.error("Error logging task activity:", err);
        // Don't fail the request if logging fails
      }
    }

    // Transform to API format
    const transformed: Task = {
      id: task.id,
      orgId: task.org_id,
      contactId: task.contact_id || undefined,
      leadId: task.lead_id || undefined, // Roofing-specific
      replyThreadId: task.reply_thread_id || undefined,
      campaignId: task.campaign_id || undefined,
      assignedTo: task.assigned_to || undefined,
      title: task.title,
      description: task.description || undefined, // Roofing-specific
      notes: task.notes || undefined,
      dueAt: task.due_at,
      dueDate: task.due_date || undefined,
      priority: task.priority || 'medium',
      status: task.status || (task.completed ? 'completed' : 'open'),
      completed: task.completed,
      completedAt: task.completed_at || undefined,
      createdAt: task.created_at,
      updatedAt: task.updated_at,
      autoGenerated: task.auto_generated,
      autoType: task.auto_type || undefined,
      createdBy: task.created_by || undefined,
      type: task.type || undefined, // Roofing-specific
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
 * DELETE /api/tasks/[id]
 */
export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = createSupabaseServer();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const taskId = params.id;

    // Get current org_id
    const orgId = await getCurrentOrgId();
    if (!orgId) {
      return NextResponse.json({ error: "No organization found" }, { status: 400 });
    }

    // Delete task
    const { error } = await supabase
      .from("tasks")
      .delete()
      .eq("id", taskId)
      .eq("org_id", orgId);

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

