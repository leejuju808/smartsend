import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

/**
 * POST /api/cron/tasks/overdue-check
 * CRON endpoint to check for overdue tasks (runs hourly)
 * Creates notifications for overdue tasks
 */
export async function POST(req: NextRequest) {
  try {
    // Verify CRON secret if provided
    const authHeader = req.headers.get("authorization");
    const cronSecret = process.env.CRON_SECRET;
    
    if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

    if (!supabaseUrl || !supabaseServiceKey) {
      return NextResponse.json(
        { error: "Missing Supabase configuration" },
        { status: 500 }
      );
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Find all overdue tasks (due before now, not completed)
    const now = new Date().toISOString();
    
    const { data: overdueTasks, error: tasksError } = await supabase
      .from("tasks")
      .select("id, title, description, due_at, assigned_to, lead_id, org_id")
      .eq("status", "open")
      .eq("completed", false)
      .lt("due_at", now);

    if (tasksError) {
      console.error("Error fetching overdue tasks:", tasksError);
      return NextResponse.json(
        { error: tasksError.message },
        { status: 500 }
      );
    }

    if (!overdueTasks || overdueTasks.length === 0) {
      return NextResponse.json({
        success: true,
        message: "No overdue tasks",
        overdue_tasks: 0,
      });
    }

    // Group tasks by assigned_to user
    const tasksByUser: Record<string, typeof overdueTasks> = {};
    for (const task of overdueTasks) {
      if (task.assigned_to) {
        if (!tasksByUser[task.assigned_to]) {
          tasksByUser[task.assigned_to] = [];
        }
        tasksByUser[task.assigned_to].push(task);
      }
    }

    let notifiedCount = 0;

    // Create notifications for each user with overdue tasks
    for (const [userId, userTasks] of Object.entries(tasksByUser)) {
      try {
        const taskCount = userTasks.length;

        // Check if notification already exists for these tasks
        // (to avoid duplicate notifications)
        const { data: existingNotifs } = await supabase
          .from("notifications")
          .select("id")
          .eq("user_id", userId)
          .eq("type", "task_overdue")
          .eq("read", false)
          .limit(1);

        // Only create notification if user doesn't have an unread overdue notification
        if (!existingNotifs || existingNotifs.length === 0) {
          const { error: notifError } = await supabase
            .from("notifications")
            .insert({
              user_id: userId,
              type: "task_overdue",
              title: `You have ${taskCount} overdue task${taskCount > 1 ? "s" : ""}`,
              body: `You have ${taskCount} overdue task${taskCount > 1 ? "s" : ""} in SmartSend.`,
              metadata: {
                task_count: taskCount,
                task_ids: userTasks.map((t) => t.id),
              },
              read: false,
            });

          if (notifError) {
            console.error(`Error creating overdue notification for user ${userId}:`, notifError);
          } else {
            notifiedCount++;
          }
        }
      } catch (error: any) {
        console.error(`Error processing user ${userId}:`, error);
      }
    }

    return NextResponse.json({
      success: true,
      message: `Overdue task check completed`,
      overdue_tasks: overdueTasks.length,
      users_notified: notifiedCount,
    });
  } catch (error: any) {
    console.error("Error in overdue task check CRON:", error);
    return NextResponse.json(
      {
        success: false,
        error: error.message || "Unknown error",
      },
      { status: 500 }
    );
  }
}

/**
 * GET /api/cron/tasks/overdue-check
 * Health check endpoint
 */
export async function GET(req: NextRequest) {
  return NextResponse.json({
    status: "ok",
    message: "Overdue task check CRON endpoint is running",
  });
}





















































