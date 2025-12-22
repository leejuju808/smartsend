import { NextResponse } from "next/server";
import { getServerSupabase } from "@/lib/supabase/server";
import { getActiveWorkspaceId } from "@/lib/workspace/context";

export const dynamic = "force-dynamic";

function startOfWeekMonday(d: Date) {
  const date = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 0, 0, 0, 0));
  // JS: Sunday=0..Saturday=6. We want Monday=0..Sunday=6
  const day = (date.getUTCDay() + 6) % 7;
  date.setUTCDate(date.getUTCDate() - day);
  return date;
}

function addDays(d: Date, days: number) {
  const x = new Date(d.getTime());
  x.setUTCDate(x.getUTCDate() + days);
  return x;
}

export async function GET() {
  try {
    const supabase = await getServerSupabase();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const workspaceId = await getActiveWorkspaceId();
    if (!workspaceId) {
      return NextResponse.json({ error: "No active workspace" }, { status: 400 });
    }

    const now = new Date();
    const weekStart = startOfWeekMonday(now);
    const weekEndExclusive = addDays(weekStart, 7);

    // Companies in this workspace (scopes estimates)
    const { data: companies, error: companyErr } = await supabase
      .from("roofing_companies")
      .select("id")
      .eq("workspace_id", workspaceId);

    if (companyErr) {
      return NextResponse.json({ error: "Failed to load companies" }, { status: 500 });
    }

    const companyIds = (companies ?? []).map((c: any) => c.id).filter(Boolean);

    let jobsBooked = 0;
    let jobsClosed = 0;

    if (companyIds.length > 0) {
      const { count: bookedCount } = await supabase
        .from("estimates")
        .select("id", { count: "exact", head: true })
        .in("company_id", companyIds)
        .gte("sent_at", weekStart.toISOString())
        .lt("sent_at", weekEndExclusive.toISOString());

      const { count: closedCount } = await supabase
        .from("estimates")
        .select("id", { count: "exact", head: true })
        .in("company_id", companyIds)
        .gte("approved_at", weekStart.toISOString())
        .lt("approved_at", weekEndExclusive.toISOString());

      jobsBooked = bookedCount ?? 0;
      jobsClosed = closedCount ?? 0;
    }

    // Emails + replies this week (best-effort)
    let emailsSent = 0;
    let replies = 0;
    try {
      const { data: insightRows } = await supabase
        .from("ai_insights_metrics")
        .select("emails_sent, emails_replied")
        .eq("workspace_id", workspaceId)
        .gte("metric_date", weekStart.toISOString().slice(0, 10))
        .lt("metric_date", weekEndExclusive.toISOString().slice(0, 10));

      emailsSent =
        insightRows?.reduce((sum: number, r: any) => sum + (Number(r.emails_sent) || 0), 0) || 0;
      replies =
        insightRows?.reduce((sum: number, r: any) => sum + (Number(r.emails_replied) || 0), 0) || 0;
    } catch {
      // ignore
    }

    const noActivity = emailsSent === 0 && replies === 0 && jobsBooked === 0 && jobsClosed === 0;

    // Block 270000 — predictable weekly rhythm (no explanation; it just shows up)
    const patternLine = noActivity
      ? null
      : "Mon–Tue: replies · Wed–Thu: estimates · Fri: booked jobs";

    return NextResponse.json({
      week_start: weekStart.toISOString().slice(0, 10),
      week_end_exclusive: weekEndExclusive.toISOString().slice(0, 10),
      jobs_booked: jobsBooked,
      jobs_closed: jobsClosed,
      no_activity: noActivity,
      pattern_line: patternLine,
    });
  } catch (error: any) {
    console.error("Reality anchor weekly route error:", error);
    return NextResponse.json({ error: error.message || "Internal server error" }, { status: 500 });
  }
}







