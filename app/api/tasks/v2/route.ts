import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getCurrentWorkspaceId } from "@/lib/workspace";

type TaskView = "today" | "this_week" | "overdue" | "completed" | "assigned_to_me" | "assigned_to_others";

export async function GET(req: NextRequest) {
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

    const { searchParams } = new URL(req.url);
    const view = (searchParams.get("view") || "today") as TaskView;
    const status = searchParams.get("status");
    const priority = searchParams.get("priority");
    const search = searchParams.get("search");

    const now = new Date();
    const startOfToday = new Date(now);
    startOfToday.setHours(0, 0, 0, 0);
    const endOfToday = new Date(now);
    endOfToday.setHours(23, 59, 59, 999);
    const endOfWeek = new Date(now);
    endOfWeek.setDate(now.getDate() + (7 - now.getDay()));
    endOfWeek.setHours(23, 59, 59, 999);

    // Build base query
    let query = supabase
      .from("tasks")
      .select(`
        *,
        contacts:contact_id (
          id,
          email,
          first_name,
          last_name
        )
      `)
      .eq("workspace_id", workspaceId);

    // Apply view filters
    switch (view) {
      case "today":
        query = query
          .gte("due_at", startOfToday.toISOString())
          .lte("due_at", endOfToday.toISOString())
          .in("status", ["open", "in_progress"]);
        break;
      case "this_week":
        query = query
          .gte("due_at", startOfToday.toISOString())
          .lte("due_at", endOfWeek.toISOString())
          .in("status", ["open", "in_progress"]);
        break;
      case "overdue":
        query = query
          .lt("due_at", now.toISOString())
          .in("status", ["open", "in_progress"]);
        break;
      case "completed":
        query = query.eq("status", "completed");
        break;
      case "assigned_to_me":
        query = query.eq("assigned_to", user.id);
        break;
      case "assigned_to_others":
        query = query
          .not("assigned_to", "is", null)
          .neq("assigned_to", user.id);
        break;
    }

    // Apply status filter
    if (status && status !== "all") {
      query = query.eq("status", status);
    }

    // Apply priority filter
    if (priority && priority !== "all") {
      query = query.eq("priority", priority);
    }

    // Apply search
    if (search) {
      query = query.or(`title.ilike.%${search}%,description.ilike.%${search}%`);
    }

    // Order by due date
    query = query.order("due_at", { ascending: true });

    const { data: tasks, error } = await query;

    if (error) {
      console.error("Error fetching tasks:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Get assigned user info for tasks
    const assignedUserIds = [
      ...new Set(
        tasks
          ?.map((t) => t.assigned_to)
          .filter((id): id is string => id !== null) || []
      ),
    ];

    let userMap: Record<string, { id: string; email: string | null }> = {};
    if (assignedUserIds.length > 0) {
      const { data: users } = await supabase.auth.admin.listUsers();
      if (users?.users) {
        userMap = users.users.reduce((acc, u) => {
          acc[u.id] = { id: u.id, email: u.email || null };
          return acc;
        }, {} as Record<string, { id: string; email: string | null }>);
      }
    }

    // Transform tasks with assigned user info
    const transformedTasks = tasks?.map((task) => ({
      ...task,
      assigned_user: task.assigned_to ? userMap[task.assigned_to] || null : null,
    }));

    return NextResponse.json({ tasks: transformedTasks || [] });
  } catch (error: any) {
    console.error("Error in GET /api/tasks/v2:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}
