import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getCurrentWorkspaceId } from "@/lib/workspace";

interface CreateTaskV2Input {
  title: string;
  description?: string | null;
  priority?: "low" | "medium" | "high";
  due_at: string;
  assigned_to?: string | null;
  contact_id?: string | null;
  thread_id?: string | null;
  job_id?: string | null;
}

export async function POST(req: NextRequest) {
  try {
    const supabase = createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body: CreateTaskV2Input = await req.json();

    // Validate required fields
    if (!body.title || !body.due_at) {
      return NextResponse.json(
        { error: "Missing required fields: title, due_at" },
        { status: 400 }
      );
    }

    // Get workspace ID
    const workspaceId = await getCurrentWorkspaceId();
    if (!workspaceId) {
      return NextResponse.json({ error: "No workspace found" }, { status: 400 });
    }

    // Determine priority if not provided (AI-assisted)
    let priority = body.priority || "medium";
    if (!body.priority && (body.thread_id || body.contact_id)) {
      try {
        const { data: priorityData } = await supabase.rpc("determine_task_priority", {
          p_thread_id: body.thread_id || null,
          p_contact_id: body.contact_id || null,
          p_title: body.title,
          p_description: body.description || null,
        });
        if (priorityData) {
          priority = priorityData;
        }
      } catch (error) {
        // Fallback to medium if function fails
        console.error("Error determining priority:", error);
      }
    }

    // Auto-assign if not provided
    let assignedTo = body.assigned_to;
    if (!assignedTo) {
      try {
        const { data: assignedUserId } = await supabase.rpc("auto_assign_task", {
          p_workspace_id: workspaceId,
          p_thread_id: body.thread_id || null,
          p_contact_id: body.contact_id || null,
        });
        if (assignedUserId) {
          assignedTo = assignedUserId;
        } else {
          // Fallback: assign to current user
          assignedTo = user.id;
        }
      } catch (error) {
        // Fallback: assign to current user
        console.error("Error auto-assigning task:", error);
        assignedTo = user.id;
      }
    }

    // Handle "me" assignment
    if (assignedTo === "me") {
      assignedTo = user.id;
    }

    // Create task
    const { data: task, error: taskError } = await supabase
      .from("tasks")
      .insert({
        workspace_id: workspaceId,
        contact_id: body.contact_id || null,
        thread_id: body.thread_id || null,
        job_id: body.job_id || null,
        title: body.title,
        description: body.description || null,
        priority,
        status: "open",
        due_at: body.due_at,
        assigned_to: assignedTo || null,
        created_by: user.id,
        metadata: {},
      })
      .select("*")
      .single();

    if (taskError) {
      console.error("Error creating task:", taskError);
      return NextResponse.json(
        { error: taskError.message || "Failed to create task" },
        { status: 500 }
      );
    }

    // Log activity feed entry
    try {
      await supabase.from("activity_feed").insert({
        workspace_id: workspaceId,
        type: "task_created",
        metadata: {
          task_id: task.id,
          title: task.title,
          priority: task.priority,
          due_at: task.due_at,
          assigned_to: task.assigned_to,
        },
        created_by: user.id,
      });
    } catch (error) {
      // Don't fail if activity feed insert fails
      console.error("Error logging activity:", error);
    }

    return NextResponse.json(
      {
        task: {
          id: task.id,
          title: task.title,
          description: task.description,
          priority: task.priority,
          status: task.status,
          due_at: task.due_at,
          assigned_to: task.assigned_to,
          contact_id: task.contact_id,
          thread_id: task.thread_id,
          job_id: task.job_id,
          created_at: task.created_at,
        },
      },
      { status: 201 }
    );
  } catch (error: any) {
    console.error("Error in POST /api/tasks/v2/create:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}



















































