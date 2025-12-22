import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// GET /api/onboarding/tasks
// Returns all onboarding tasks with user's completion status
export async function GET() {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Get all tasks
    const { data: tasks, error: tasksError } = await supabase
      .from("onboarding_tasks")
      .select("*")
      .order("order_index", { ascending: true });

    if (tasksError) {
      console.error("Error fetching tasks:", tasksError);
      return NextResponse.json({ error: "Failed to fetch tasks" }, { status: 500 });
    }

    // Get user's progress
    const { data: progress, error: progressError } = await supabase
      .from("user_onboarding_progress")
      .select("task_id, completed, completed_at")
      .eq("user_id", user.id);

    if (progressError) {
      console.error("Error fetching progress:", progressError);
      // Continue without progress data
    }

    // Merge tasks with progress
    const tasksWithProgress = (tasks || []).map((task) => {
      const userProgress = progress?.find((p) => p.task_id === task.id);
      return {
        id: task.id,
        key: task.key,
        title: task.title,
        description: task.description,
        orderIndex: task.order_index,
        completed: userProgress?.completed || false,
        completedAt: userProgress?.completed_at || null,
      };
    });

    // Calculate completion percentage
    const completedCount = tasksWithProgress.filter((t) => t.completed).length;
    const totalCount = tasksWithProgress.length;
    const completionPercent = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;

    return NextResponse.json({
      tasks: tasksWithProgress,
      completionPercent,
      completedCount,
      totalCount,
    });
  } catch (error: any) {
    console.error("Error in onboarding tasks API:", error);
    return NextResponse.json({ error: error.message || "Internal server error" }, { status: 500 });
  }
}

// POST /api/onboarding/tasks
// Marks a task as completed or incomplete
export async function POST(req: Request) {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { taskId, completed } = await req.json();

    if (!taskId) {
      return NextResponse.json({ error: "taskId is required" }, { status: 400 });
    }

    // Verify task exists
    const { data: task, error: taskError } = await supabase
      .from("onboarding_tasks")
      .select("id")
      .eq("id", taskId)
      .single();

    if (taskError || !task) {
      return NextResponse.json({ error: "Task not found" }, { status: 404 });
    }

    // Upsert progress
    const updateData: any = {
      user_id: user.id,
      task_id: taskId,
      completed: completed !== false, // default to true if not specified
    };

    if (completed !== false) {
      updateData.completed_at = new Date().toISOString();
    } else {
      updateData.completed_at = null;
    }

    const { error: upsertError } = await supabase
      .from("user_onboarding_progress")
      .upsert(updateData, {
        onConflict: "user_id,task_id",
      });

    if (upsertError) {
      console.error("Error updating progress:", upsertError);
      return NextResponse.json({ error: "Failed to update progress" }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (error: any) {
    console.error("Error in onboarding tasks POST API:", error);
    return NextResponse.json({ error: error.message || "Internal server error" }, { status: 500 });
  }
}


























