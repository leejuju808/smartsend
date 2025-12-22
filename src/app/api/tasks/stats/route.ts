// Block 13900 — Smart Tasks v2 Dashboard Stats API
// GET /api/tasks/stats - Get task statistics for dashboard cards

import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServer } from "@/lib/supabaseServer";
import { getCurrentOrgId } from "@/lib/org-helpers";

export type TaskStats = {
  hotLeadsNeedingAction: number;
  insuranceLeads: number;
  stormLeads: number;
  overdueTasks: number;
  todayTasks: number;
  tomorrowTasks: number;
  thisWeekTasks: number;
};

/**
 * GET /api/tasks/stats
 * Returns task statistics for dashboard cards
 */
export async function GET(req: NextRequest) {
  try {
    const supabase = createSupabaseServer();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Get current org_id
    const orgId = await getCurrentOrgId();
    if (!orgId) {
      return NextResponse.json({ error: "No organization found" }, { status: 400 });
    }

    const now = new Date();
    const startOfToday = new Date(now.setHours(0, 0, 0, 0));
    const endOfToday = new Date(now.setHours(23, 59, 59, 999));
    const startOfTomorrow = new Date(now);
    startOfTomorrow.setDate(startOfTomorrow.getDate() + 1);
    startOfTomorrow.setHours(0, 0, 0, 0);
    const endOfTomorrow = new Date(startOfTomorrow);
    endOfTomorrow.setHours(23, 59, 59, 999);
    const endOfWeek = new Date(now);
    endOfWeek.setDate(now.getDate() + (7 - now.getDay()));

    // Get HOT leads needing action (score >= 70, open tasks)
    const { count: hotLeadsCount } = await supabase
      .from("tasks")
      .select("*", { count: "exact", head: true })
      .eq("org_id", orgId)
      .eq("completed", false)
      .eq("status", "open")
      .eq("priority", "high")
      .in("auto_type", ["hot_lead", "high_value"]);

    // Get insurance leads (open insurance tasks)
    const { count: insuranceCount } = await supabase
      .from("tasks")
      .select("*", { count: "exact", head: true })
      .eq("org_id", orgId)
      .eq("completed", false)
      .eq("status", "open")
      .eq("auto_type", "insurance_keywords");

    // Get storm leads (open storm tasks)
    const { count: stormCount } = await supabase
      .from("tasks")
      .select("*", { count: "exact", head: true })
      .eq("org_id", orgId)
      .eq("completed", false)
      .eq("status", "open")
      .eq("auto_type", "storm_risk");

    // Get overdue tasks
    const { count: overdueCount } = await supabase
      .from("tasks")
      .select("*", { count: "exact", head: true })
      .eq("org_id", orgId)
      .eq("completed", false)
      .eq("status", "open")
      .lt("due_at", startOfToday.toISOString());

    // Get today's tasks
    const { count: todayCount } = await supabase
      .from("tasks")
      .select("*", { count: "exact", head: true })
      .eq("org_id", orgId)
      .eq("completed", false)
      .eq("status", "open")
      .gte("due_at", startOfToday.toISOString())
      .lte("due_at", endOfToday.toISOString());

    // Get tomorrow's tasks
    const { count: tomorrowCount } = await supabase
      .from("tasks")
      .select("*", { count: "exact", head: true })
      .eq("org_id", orgId)
      .eq("completed", false)
      .eq("status", "open")
      .gte("due_at", startOfTomorrow.toISOString())
      .lte("due_at", endOfTomorrow.toISOString());

    // Get this week's tasks
    const { count: thisWeekCount } = await supabase
      .from("tasks")
      .select("*", { count: "exact", head: true })
      .eq("org_id", orgId)
      .eq("completed", false)
      .eq("status", "open")
      .gte("due_at", startOfToday.toISOString())
      .lte("due_at", endOfWeek.toISOString());

    const stats: TaskStats = {
      hotLeadsNeedingAction: hotLeadsCount || 0,
      insuranceLeads: insuranceCount || 0,
      stormLeads: stormCount || 0,
      overdueTasks: overdueCount || 0,
      todayTasks: todayCount || 0,
      tomorrowTasks: tomorrowCount || 0,
      thisWeekTasks: thisWeekCount || 0,
    };

    return NextResponse.json({ data: stats });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}





















































