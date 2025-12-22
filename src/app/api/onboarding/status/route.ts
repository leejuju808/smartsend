// Block 95000 — Get User Onboarding Status
// Returns all onboarding tasks with completion status

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(req: Request) {
  try {
    const supabase = createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Get user onboarding status using the RPC function
    const { data: tasks, error: tasksError } = await supabase
      .rpc("get_user_onboarding_status", { p_user_id: user.id });

    if (tasksError) {
      console.error("Error fetching onboarding status:", tasksError);
      return NextResponse.json(
        { error: "Failed to fetch onboarding status" },
        { status: 500 }
      );
    }

    // Check first_login status
    const { data: profile } = await supabase
      .from("profiles")
      .select("first_login")
      .eq("id", user.id)
      .single();

    if (tasks && Array.isArray(tasks)) {
      const requiredTasks = tasks.filter((t: any) => t.required);
      const completedCount = tasks.filter((t: any) => t.completed).length;
      const totalCount = tasks.length;
      const progressPercent = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;
      const allRequiredDone = requiredTasks.every((t: any) => t.completed);

      return NextResponse.json({
        tasks,
        first_login: profile?.first_login ?? true,
        progress: {
          completed: completedCount,
          total: totalCount,
          percent: progressPercent,
        },
        all_complete: allRequiredDone,
      });
    }

    return NextResponse.json({
      tasks: [],
      first_login: profile?.first_login ?? true,
      progress: { completed: 0, total: 0, percent: 0 },
      all_complete: false,
    });
  } catch (error: any) {
    console.error("Error in onboarding status:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}
