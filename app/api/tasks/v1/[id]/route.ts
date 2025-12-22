import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServer } from "@/lib/supabaseServer";
import { getCurrentWorkspaceId } from "@/lib/workspace";

/**
 * GET /api/tasks/v1/[id]
 * Get a single task by ID
 */
export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
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

    const { data: task, error } = await supabase
      .from("smartsend_tasks")
      .select(`
        *,
        contacts (
          id,
          email,
          first_name,
          last_name,
          phone,
          city,
          state,
          postal_code
        ),
        pipeline_stages (
          id,
          key,
          label
        )
      `)
      .eq("id", params.id)
      .eq("workspace_id", workspaceId)
      .single();

    if (error) {
      console.error("Error fetching task:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    if (!task) {
      return NextResponse.json({ error: "Task not found" }, { status: 404 });
    }

    return NextResponse.json({ task });
  } catch (error) {
    console.error("Error in GET /api/tasks/v1/[id]:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

/**
 * PUT /api/tasks/v1/[id]
 * Update a task
 * 
 * Body: Partial task fields
 */
export async function PUT(
  req: NextRequest,
  { params }: { params: { id: string } }
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

    const body = await req.json();
    const {
      status,
      urgency,
      title,
      description,
      notes,
      due_at,
      user_id,
      pipeline_stage_id,
      metadata,
      suggested_next_stage,
    } = body;

    // Build update object
    const updates: any = {};

    if (status !== undefined) updates.status = status;
    if (urgency !== undefined) updates.urgency = urgency;
    if (title !== undefined) updates.title = title;
    if (description !== undefined) updates.description = description;
    if (notes !== undefined) updates.notes = notes;
    if (due_at !== undefined) {
      updates.due_at = due_at;
      // Recalculate status if due_at changes
      const dueDate = new Date(due_at);
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const dueDateOnly = new Date(dueDate);
      dueDateOnly.setHours(0, 0, 0, 0);
      
      if (status === undefined) {
        if (dueDateOnly.getTime() === today.getTime()) {
          updates.status = "today";
        } else if (status !== "waiting_on_homeowner" && status !== "completed") {
          updates.status = "upcoming";
        }
      }
    }
    if (user_id !== undefined) updates.user_id = user_id;
    if (pipeline_stage_id !== undefined) updates.pipeline_stage_id = pipeline_stage_id;
    if (metadata !== undefined) updates.metadata = metadata;
    if (suggested_next_stage !== undefined) updates.suggested_next_stage = suggested_next_stage;

    // If marking as completed, set completed_at
    if (status === "completed" && !body.completed_at) {
      updates.completed_at = new Date().toISOString();
    }

    const { data: task, error } = await supabase
      .from("smartsend_tasks")
      .update(updates)
      .eq("id", params.id)
      .eq("workspace_id", workspaceId)
      .select(`
        *,
        contacts (
          id,
          email,
          first_name,
          last_name,
          phone
        ),
        pipeline_stages (
          id,
          key,
          label
        )
      `)
      .single();

    if (error) {
      console.error("Error updating task:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    if (!task) {
      return NextResponse.json({ error: "Task not found" }, { status: 404 });
    }

    return NextResponse.json({ task });
  } catch (error) {
    console.error("Error in PUT /api/tasks/v1/[id]:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/tasks/v1/[id]
 * Delete a task
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

    const workspaceId = await getCurrentWorkspaceId();
    if (!workspaceId) {
      return NextResponse.json({ error: "No workspace found" }, { status: 400 });
    }

    const { error } = await supabase
      .from("smartsend_tasks")
      .delete()
      .eq("id", params.id)
      .eq("workspace_id", workspaceId);

    if (error) {
      console.error("Error deleting task:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error in DELETE /api/tasks/v1/[id]:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}





















































