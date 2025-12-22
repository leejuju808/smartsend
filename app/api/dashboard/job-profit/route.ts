import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(req: NextRequest) {
  const supabase = createClient();

  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Get workspace_id from workspace_members
  const { data: membership, error: memError } = await supabase
    .from("workspace_members")
    .select("workspace_id")
    .eq("user_id", user.id)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (memError || !membership) {
    return NextResponse.json({ error: "No workspace found" }, { status: 404 });
  }

  const workspaceId = membership.workspace_id;

  try {
    // Get all jobs with financial data
    const { data: jobs, error } = await supabase
      .from("roofing_jobs")
      .select(`
        id,
        title,
        job_value,
        revenue_collected,
        actual_total_cost,
        actual_gross_profit,
        actual_margin_pct,
        status,
        scheduled_start_date,
        scheduled_end_date
      `)
      .eq("workspace_id", workspaceId)
      .not("revenue_collected", "is", null)
      .order("scheduled_start_date", { ascending: false });

    if (error) {
      console.error(error);
      return NextResponse.json(
        { error: error.message },
        { status: 500 }
      );
    }

    const jobsList = jobs || [];

    // Filter completed jobs with revenue
    const completed = jobsList.filter(
      (j: any) => j.status === "completed" && j.revenue_collected > 0
    );

    // Calculate average margin
    const avgMargin =
      completed.length > 0
        ? completed.reduce(
            (sum: number, j: any) => sum + (j.actual_margin_pct || 0),
            0
          ) / completed.length
        : 0;

    // Top 5 most profitable jobs (by profit amount)
    const topProfitable = [...completed]
      .sort(
        (a, b) => (b.actual_gross_profit || 0) - (a.actual_gross_profit || 0)
      )
      .slice(0, 5);

    // Top 5 worst margin jobs (lowest margin %)
    const worstMargin = [...completed]
      .sort(
        (a, b) => (a.actual_margin_pct || 0) - (b.actual_margin_pct || 0)
      )
      .slice(0, 5);

    return NextResponse.json(
      {
        jobs: jobsList,
        avgMargin,
        topProfitable,
        worstMargin,
      },
      { headers: { "Content-Type": "application/json" } }
    );
  } catch (error: any) {
    console.error("Job profit dashboard error:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}








































