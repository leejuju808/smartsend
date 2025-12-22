import { NextResponse } from "next/server";
import { getServerSupabase } from "@/lib/supabase/server";
import { getActiveWorkspaceId } from "@/lib/workspace/context";

type TimelineItem = {
  date: string; // YYYY-MM-DD
  label: string; // Mon/Tue/...
  value: number;
};

function startOfMonth(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), 1, 0, 0, 0, 0);
}

function startOfNextMonth(d: Date) {
  return new Date(d.getFullYear(), d.getMonth() + 1, 1, 0, 0, 0, 0);
}

function endOfMonth(d: Date) {
  return new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59, 999);
}

function formatISODate(d: Date) {
  return d.toISOString().slice(0, 10);
}

function weekdayShort(d: Date) {
  return d.toLocaleDateString("en-US", { weekday: "short" });
}

function isCloseoutWindow(now: Date) {
  const eom = endOfMonth(now);
  const msInDay = 24 * 60 * 60 * 1000;
  const threeDaysBefore = new Date(eom.getTime() - 3 * msInDay);
  return now >= threeDaysBefore && now <= eom;
}

function monthlyFeeForPlanId(planId: string | null | undefined): number {
  const key = (planId || "").toLowerCase();

  // Canonical SmartSend pricing tiers used throughout ROI engine.
  // If pricing changes, update here and the ROI engine migration/constants.
  if (!key || key === "free" || key === "trial") return 0;
  if (key === "starter") return 99;
  if (key === "growth") return 199;
  if (key === "domination") return 399;

  // Common aliases across legacy billing systems
  if (key === "basic") return 99;
  if (key === "pro") return 199;
  if (key === "scale") return 399;

  // Safe fallback: keep the prior sprint assumption instead of returning 0.
  return 99;
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
    const monthStart = startOfMonth(now);
    const monthEndExclusive = startOfNextMonth(now);

    // --- 1) SmartSend monthly fee (workspace plan) ---
    const { data: billingState } = await supabase
      .from("workspace_billing_state")
      .select("plan_id")
      .eq("workspace_id", workspaceId)
      .maybeSingle();

    const smartSendCostThisMonth = monthlyFeeForPlanId((billingState as any)?.plan_id);

    // --- 2) Job-level: SmartSend-attributed closed value this month (estimates) ---
    // Anchor rule: approved estimate with origin_source = 'smartsend' (set on send/approve; DB locks it).
    const { data: companies, error: companyErr } = await supabase
      .from("roofing_companies")
      .select("id")
      .eq("workspace_id", workspaceId);

    if (companyErr) {
      return NextResponse.json({ error: "Failed to load companies" }, { status: 500 });
    }

    const companyIds = (companies ?? []).map((c: any) => c.id).filter(Boolean);

    const { data: closedEstimates, error: closedErr } = await supabase
      .from("estimates")
      .select("id, total, approved_at, origin_source")
      .in("company_id", companyIds.length ? companyIds : ["00000000-0000-0000-0000-000000000000"])
      .eq("origin_source", "smartsend")
      .not("approved_at", "is", null)
      .gte("approved_at", monthStart.toISOString())
      .lt("approved_at", monthEndExclusive.toISOString());

    if (closedErr) {
      return NextResponse.json({ error: "Failed to load SmartSend job revenue" }, { status: 500 });
    }

    const wonValueThisMonth =
      closedEstimates?.reduce((sum: number, e: any) => sum + (Number(e.total) || 0), 0) || 0;

    // --- 3) Monthly close-out snapshot (end-of-month window only) ---
    // Emails + replies: use ai_insights_metrics daily snapshots.
    const { data: insightRows } = await supabase
      .from("ai_insights_metrics")
      .select("emails_sent, emails_replied")
      .eq("workspace_id", workspaceId)
      .gte("metric_date", formatISODate(monthStart))
      .lt("metric_date", formatISODate(monthEndExclusive));

    const emailsSent =
      insightRows?.reduce((sum: number, r: any) => sum + (Number(r.emails_sent) || 0), 0) || 0;
    const replies =
      insightRows?.reduce((sum: number, r: any) => sum + (Number(r.emails_replied) || 0), 0) || 0;

    // Jobs booked/closed: estimate lifecycle (job-level).
    // Booked = estimate sent this month (origin_source=smartsend)
    // Closed = estimate approved this month (origin_source=smartsend)
    let jobsBooked = 0;
    let jobsClosed = 0;
    if (companyIds.length > 0) {
      const { count: booked } = await supabase
        .from("estimates")
        .select("id", { count: "exact", head: true })
        .in("company_id", companyIds)
        .eq("origin_source", "smartsend")
        .not("sent_at", "is", null)
        .gte("sent_at", monthStart.toISOString())
        .lt("sent_at", monthEndExclusive.toISOString());
      jobsBooked = booked ?? 0;

      jobsClosed = closedEstimates?.length ?? 0;
    }

    // --- 4) Estimated job value generated (month-to-date) ---
    // For this sprint, keep it brutally simple: closed value only.
    const estimatedJobValueGenerated = wonValueThisMonth;

    // --- 4b) Avg SmartSend cost per closed job (month-to-date) ---
    const avgSmartSendCostPerClosedJob =
      jobsClosed > 0 ? smartSendCostThisMonth / jobsClosed : null;

    // --- 5) Job value timeline (straight list, no chart) ---
    // Show daily increments from closed jobs (approved estimates).
    const timelineByDate = new Map<string, number>();
    for (const e of closedEstimates ?? []) {
      const approvedAt = (e as any).approved_at ? new Date((e as any).approved_at) : null;
      if (!approvedAt) continue;
      const key = formatISODate(approvedAt);
      timelineByDate.set(key, (timelineByDate.get(key) || 0) + (Number((e as any).total) || 0));
    }

    const timeline: TimelineItem[] = Array.from(timelineByDate.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, value]) => {
        const d = new Date(`${date}T12:00:00.000Z`);
        return { date, label: weekdayShort(d), value };
      });

    return NextResponse.json({
      smartSendCostThisMonth,
      jobsClosedThisMonth: jobsClosed,
      avgSmartSendCostPerClosedJob,
      estimatedJobValueGenerated,
      paidForItself: estimatedJobValueGenerated >= 1000,
      attributionLine: "These jobs originated from SmartSend outreach.",
      timeline,
      closeout: {
        show: isCloseoutWindow(now),
        month: now.toLocaleDateString("en-US", { month: "long", year: "numeric" }),
        emailsSent,
        replies,
        jobsBooked,
        jobsClosed,
        estimatedRevenue: estimatedJobValueGenerated,
      },
    });
  } catch (error: any) {
    console.error("Financial reality route error:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}








