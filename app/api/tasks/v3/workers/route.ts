// Block 18100 — SmartSend Task System v3
// Worker endpoints for auto-generation, priority calculation, auto-complete, and overdue checks

import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServer } from "@/lib/supabaseServer";

/**
 * POST /api/tasks/v3/workers/priority-calc
 * Recalculate priority scores for all open tasks
 */
export async function POST(req: NextRequest) {
  try {
    const supabase = createSupabaseServer();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const taskId = body.taskId; // Optional: calculate for specific task

    if (taskId) {
      // Calculate for specific task
      const { data, error } = await supabase.rpc('calculate_task_priority_score', {
        p_task_id: taskId
      });

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }

      return NextResponse.json({ 
        success: true, 
        taskId,
        priorityScore: data 
      });
    } else {
      // Calculate for all open tasks in workspace
      const workspaceId = body.workspaceId;
      if (!workspaceId) {
        return NextResponse.json({ error: "workspaceId required" }, { status: 400 });
      }

      const { data: tasks, error: tasksError } = await supabase
        .from("tasks_v3")
        .select("id")
        .eq("workspace_id", workspaceId)
        .eq("status", "open");

      if (tasksError) {
        return NextResponse.json({ error: tasksError.message }, { status: 500 });
      }

      let calculated = 0;
      for (const task of tasks || []) {
        await supabase.rpc('calculate_task_priority_score', {
          p_task_id: task.id
        });
        calculated++;
      }

      return NextResponse.json({ 
        success: true, 
        calculated,
        total: tasks?.length || 0
      });
    }
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}

/**
 * POST /api/tasks/v3/workers/auto-complete
 * Run auto-complete logic
 */
export async function PUT(req: NextRequest) {
  try {
    const supabase = createSupabaseServer();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { error } = await supabase.rpc('auto_complete_tasks_v3');

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

/**
 * POST /api/tasks/v3/workers/overdue-check
 * Check for overdue tasks and create recovery tasks
 */
export async function PATCH(req: NextRequest) {
  try {
    const supabase = createSupabaseServer();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { error } = await supabase.rpc('check_overdue_tasks_v3');

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

/**
 * POST /api/tasks/v3/workers/recurrent
 * Process recurrent tasks
 */
export async function GET(req: NextRequest) {
  try {
    const supabase = createSupabaseServer();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { error } = await supabase.rpc('process_recurrent_tasks_v3');

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





















































