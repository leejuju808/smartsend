// Block 22112 — Action Queue v2 API
// GET: Fetch action queue tasks for current user/workspace
// POST: Complete a task

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getCurrentWorkspaceId } from "@/lib/workspace";

export async function GET(req: NextRequest) {
  const supabase = createClient();
  
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const workspaceId = await getCurrentWorkspaceId();
  if (!workspaceId) {
    return NextResponse.json({ error: "Workspace not found" }, { status: 404 });
  }

  // Get query params
  const searchParams = req.nextUrl.searchParams;
  const priority = searchParams.get("priority"); // Filter by priority (1, 2, 3)
  const category = searchParams.get("category"); // Filter by category
  const status = searchParams.get("status") || "open"; // Default to open tasks
  const assignedToMe = searchParams.get("assigned_to_me") === "true";

  try {
    // Build query
    let query = supabase
      .from("action_queue_v2_view")
      .select("*")
      .eq("workspace_id", workspaceId)
      .eq("status", status)
      .order("action_priority", { ascending: true })
      .order("due_at", { ascending: true, nullsFirst: false })
      .order("created_at", { ascending: true });

    // Filter by assigned user if requested
    if (assignedToMe) {
      query = query.eq("assigned_user_id", user.id);
    }

    // Filter by priority
    if (priority) {
      query = query.eq("action_priority", parseInt(priority));
    }

    // Filter by category
    if (category) {
      query = query.eq("action_category", category);
    }

    const { data: tasks, error } = await query;

    if (error) {
      console.error("Error fetching action queue:", error);
      return NextResponse.json(
        { error: "Failed to fetch action queue" },
        { status: 500 }
      );
    }

    // Group tasks by priority
    const grouped = {
      priority1: tasks?.filter(t => t.action_priority === 1) || [],
      priority2: tasks?.filter(t => t.action_priority === 2) || [],
      priority3: tasks?.filter(t => t.action_priority === 3) || [],
    };

    return NextResponse.json({
      tasks: tasks || [],
      grouped,
      counts: {
        total: tasks?.length || 0,
        priority1: grouped.priority1.length,
        priority2: grouped.priority2.length,
        priority3: grouped.priority3.length,
      },
    });
  } catch (error: any) {
    console.error("Error in GET /api/action-queue:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  const supabase = createClient();
  
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const workspaceId = await getCurrentWorkspaceId();
  if (!workspaceId) {
    return NextResponse.json({ error: "Workspace not found" }, { status: 404 });
  }

  try {
    const body = await req.json();
    const { task_id, action } = body;

    if (!task_id || !action) {
      return NextResponse.json(
        { error: "Missing required fields: task_id and action" },
        { status: 400 }
      );
    }

    // Verify task exists and user has access
    const { data: task, error: taskError } = await supabase
      .from("action_queue_tasks")
      .select("*")
      .eq("id", task_id)
      .eq("workspace_id", workspaceId)
      .single();

    if (taskError || !task) {
      return NextResponse.json({ error: "Task not found" }, { status: 404 });
    }

    // Handle different actions
    if (action === "complete") {
      // Mark task as completed
      const { error: updateError } = await supabase
        .from("action_queue_tasks")
        .update({
          status: "done",
          completed_at: new Date().toISOString(),
        })
        .eq("id", task_id);

      if (updateError) {
        console.error("Error completing task:", updateError);
        return NextResponse.json(
          { error: "Failed to complete task" },
          { status: 500 }
        );
      }

      // Trigger next action generation for the lead
      try {
        await supabase.functions.invoke("generate-next-action", {
          body: { lead_id: task.lead_id },
        });
      } catch (err) {
        // Don't fail if next action generation fails
        console.error("Error generating next action:", err);
      }

      // Regenerate action queue for this lead
      try {
        await supabase.functions.invoke("generate-action-queue", {
          body: { lead_id: task.lead_id, workspace_id: workspaceId },
        });
      } catch (err) {
        // Don't fail if queue regeneration fails
        console.error("Error regenerating action queue:", err);
      }

      return NextResponse.json({ ok: true, task_id });
    } else if (action === "skip") {
      // Mark task as skipped
      const { error: updateError } = await supabase
        .from("action_queue_tasks")
        .update({
          status: "skipped",
          completed_at: new Date().toISOString(),
        })
        .eq("id", task_id);

      if (updateError) {
        console.error("Error skipping task:", updateError);
        return NextResponse.json(
          { error: "Failed to skip task" },
          { status: 500 }
        );
      }

      return NextResponse.json({ ok: true, task_id });
    } else {
      return NextResponse.json(
        { error: "Invalid action. Use 'complete' or 'skip'" },
        { status: 400 }
      );
    }
  } catch (error: any) {
    console.error("Error in POST /api/action-queue:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}
