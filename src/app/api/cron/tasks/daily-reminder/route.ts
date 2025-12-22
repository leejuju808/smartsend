import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

/**
 * POST /api/cron/tasks/daily-reminder
 * CRON endpoint to send daily task reminders at 8 AM
 * Runs daily at 8 AM to send email notifications for tasks due today
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

    // Get current date (start of today)
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const endOfToday = new Date(today);
    endOfToday.setHours(23, 59, 59, 999);

    // Find all open tasks due today, grouped by user
    const { data: tasks, error: tasksError } = await supabase
      .from("tasks")
      .select("id, title, description, due_at, assigned_to, lead_id, org_id")
      .eq("status", "open")
      .eq("completed", false)
      .gte("due_at", today.toISOString())
      .lte("due_at", endOfToday.toISOString());

    if (tasksError) {
      console.error("Error fetching tasks:", tasksError);
      return NextResponse.json(
        { error: tasksError.message },
        { status: 500 }
      );
    }

    if (!tasks || tasks.length === 0) {
      return NextResponse.json({
        success: true,
        message: "No tasks due today",
        tasks_notified: 0,
      });
    }

    // Group tasks by assigned_to user
    const tasksByUser: Record<string, typeof tasks> = {};
    for (const task of tasks) {
      if (task.assigned_to) {
        if (!tasksByUser[task.assigned_to]) {
          tasksByUser[task.assigned_to] = [];
        }
        tasksByUser[task.assigned_to].push(task);
      }
    }

    let notifiedCount = 0;

    // Send email notification to each user
    for (const [userId, userTasks] of Object.entries(tasksByUser)) {
      try {
        // Get user email
        const { data: userData } = await supabase.auth.admin.getUserById(userId);
        if (!userData?.user?.email) {
          console.warn(`No email found for user ${userId}`);
          continue;
        }

        const userEmail = userData.user.email;
        const taskCount = userTasks.length;

        // Create notification record (if notifications table exists)
        // This will be picked up by the notification system
        const { error: notifError } = await supabase
          .from("notifications")
          .insert({
            user_id: userId,
            type: "task_due_today",
            title: `You have ${taskCount} task${taskCount > 1 ? "s" : ""} due today`,
            body: `You have ${taskCount} task${taskCount > 1 ? "s" : ""} due today in SmartSend.`,
            metadata: {
              task_count: taskCount,
              task_ids: userTasks.map((t) => t.id),
            },
            read: false,
          })
          .select()
          .single();

        if (notifError) {
          console.error(`Error creating notification for user ${userId}:`, notifError);
        } else {
          notifiedCount++;
        }

        // TODO: Send email notification via email service
        // For now, we'll just create the notification record
        // In production, integrate with your email service (Resend, SendGrid, etc.)
        console.log(`Would send email to ${userEmail} about ${taskCount} tasks due today`);
      } catch (error: any) {
        console.error(`Error processing user ${userId}:`, error);
      }
    }

    return NextResponse.json({
      success: true,
      message: `Daily task reminders sent`,
      tasks_found: tasks.length,
      users_notified: notifiedCount,
    });
  } catch (error: any) {
    console.error("Error in daily task reminder CRON:", error);
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
 * GET /api/cron/tasks/daily-reminder
 * Health check endpoint
 */
export async function GET(req: NextRequest) {
  return NextResponse.json({
    status: "ok",
    message: "Daily task reminder CRON endpoint is running",
  });
}





















































