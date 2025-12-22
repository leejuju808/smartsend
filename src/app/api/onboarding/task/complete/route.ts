// Block 95000 — Onboarding Task Completion API
// Toggles onboarding task completion and checks if all tasks are done

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST(req: Request) {
  try {
    const supabase = createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { task_id, completed } = await req.json();

    if (!task_id || typeof completed !== "boolean") {
      return NextResponse.json(
        { error: "Missing task_id or completed status" },
        { status: 400 }
      );
    }

    // Update the task completion status
    const { error: updateError } = await supabase
      .from("user_onboarding_progress")
      .update({
        completed,
        completed_at: completed ? new Date().toISOString() : null,
      })
      .eq("user_id", user.id)
      .eq("task_id", task_id);

    if (updateError) {
      console.error("Error updating task:", updateError);
      return NextResponse.json(
        { error: "Failed to update task" },
        { status: 500 }
      );
    }

    // Check if all required tasks are completed
    const { data: tasks, error: tasksError } = await supabase
      .rpc("get_user_onboarding_status", { p_user_id: user.id });

    if (tasksError) {
      console.error("Error fetching tasks:", tasksError);
      // Still return success for the update
      return NextResponse.json({ status: "ok" });
    }

    if (tasks && Array.isArray(tasks)) {
      const requiredTasks = tasks.filter((t: any) => t.required);
      const allRequiredDone = requiredTasks.every((t: any) => t.completed);

      if (allRequiredDone) {
        // Mark first_login as false and redirect to dashboard
        const { error: profileError } = await supabase
          .from("profiles")
          .update({ first_login: false })
          .eq("id", user.id);

        if (profileError) {
          console.error("Error updating first_login:", profileError);
        }

        return NextResponse.json({
          status: "ok",
          all_complete: true,
          message: "Onboarding complete!",
        });
      }
    }

    return NextResponse.json({ status: "ok", all_complete: false });
  } catch (error: any) {
    console.error("Error in onboarding task complete:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}


























