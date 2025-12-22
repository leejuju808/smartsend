import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getCurrentWorkspaceId } from "@/lib/workspace";

export async function POST(req: NextRequest) {
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

    const { threadIds } = await req.json();

    if (!Array.isArray(threadIds) || threadIds.length === 0) {
      return NextResponse.json({ counts: {} });
    }

    const now = new Date();
    const startOfToday = new Date(now);
    startOfToday.setHours(0, 0, 0, 0);
    const endOfToday = new Date(now);
    endOfToday.setHours(23, 59, 59, 999);

    // Get all tasks for these threads
    const { data: tasks, error } = await supabase
      .from("tasks")
      .select("id, thread_id, status, due_at")
      .eq("workspace_id", workspaceId)
      .in("thread_id", threadIds)
      .in("status", ["open", "in_progress"]);

    if (error) {
      console.error("Error fetching task counts:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Calculate counts per thread
    const counts: Record<string, {
      open: number;
      overdue: number;
      dueToday: number;
      allCompleted: boolean;
    }> = {};

    // Initialize all threads
    threadIds.forEach((threadId: string) => {
      counts[threadId] = {
        open: 0,
        overdue: 0,
        dueToday: 0,
        allCompleted: true,
      };
    });

    // Process tasks
    tasks?.forEach((task) => {
      if (!task.thread_id) return;

      const threadId = task.thread_id;
      if (!counts[threadId]) {
        counts[threadId] = {
          open: 0,
          overdue: 0,
          dueToday: 0,
          allCompleted: true,
        };
      }

      counts[threadId].allCompleted = false;
      counts[threadId].open += 1;

      if (task.due_at) {
        const dueDate = new Date(task.due_at);
        
        if (dueDate < now) {
          counts[threadId].overdue += 1;
        } else if (dueDate >= startOfToday && dueDate <= endOfToday) {
          counts[threadId].dueToday += 1;
        }
      }
    });

    return NextResponse.json({ counts });
  } catch (error: any) {
    console.error("Error in POST /api/tasks/v2/thread-counts:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}



















































