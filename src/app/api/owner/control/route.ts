import { NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { getActiveWorkspaceId } from "@/lib/workspace/context";

type HotHomeownerRow = {
  id: string;
  subject: string | null;
  body: string | null;
  sender: string | null;
  sender_email: string | null;
  created_at: string;
  read_at: string | null;
  lead_id: string | null;
  leads:
    | {
        first_name: string | null;
        last_name: string | null;
        email: string | null;
      }
    | null;
};

function num(v: unknown): number {
  if (typeof v === "number") return v;
  const n = Number(String(v ?? ""));
  return Number.isFinite(n) ? n : 0;
}

function startOfTodayIso() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
}

function daysAgoIso(days: number) {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
}

export async function GET() {
  const supabase = createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const workspaceId = await getActiveWorkspaceId();
  if (!workspaceId) {
    return NextResponse.json({ error: "No active workspace" }, { status: 400 });
  }

  // Cookie-derived workspace must be validated (service role bypasses RLS).
  const { data: isMember } = await supabase.rpc("is_workspace_member", {
    p_ws: workspaceId,
    p_uid: user.id,
  });
  if (!isMember) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const admin = createServiceClient();

  // Resolve roofing company scope for estimates/jobs.
  const { data: companies, error: companiesError } = await admin
    .from("roofing_companies")
    .select("id")
    .eq("workspace_id", workspaceId)
    .eq("is_active", true)
    .limit(50);

  if (companiesError) {
    return NextResponse.json(
      { error: "Failed to resolve companies", details: companiesError.message },
      { status: 500 }
    );
  }

  const companyIds = (companies ?? []).map((c: any) => c.id).filter(Boolean);

  // ===========================================================================
  // Hot homeowners waiting (hot inbound messages, not replied)
  // ===========================================================================
  const { count: hotHomeownersCount } = await admin
    .from("inbox_messages")
    .select("id", { count: "exact", head: true })
    .eq("workspace_id", workspaceId)
    .eq("direction", "inbound")
    .eq("intent", "hot_lead")
    .eq("replied", false);

  const { data: hotRows } = await admin
    .from("inbox_messages")
    .select(
      `
      id,
      subject,
      body,
      sender,
      sender_email,
      created_at,
      read_at,
      lead_id,
      leads:lead_id(first_name,last_name,email)
    `
    )
    .eq("workspace_id", workspaceId)
    .eq("direction", "inbound")
    .eq("intent", "hot_lead")
    .eq("replied", false)
    .order("created_at", { ascending: false })
    .limit(12);

  const hotHomeowners = ((hotRows ?? []) as unknown as HotHomeownerRow[]).map((m) => {
    const leadName = `${m.leads?.first_name || ""} ${m.leads?.last_name || ""}`.trim();
    return {
      id: m.id,
      created_at: m.created_at,
      read_at: m.read_at,
      subject: m.subject ?? "(No subject)",
      snippet: String(m.body || "").replace(/\s+/g, " ").slice(0, 180),
      homeowner_name: leadName || m.leads?.email || m.sender || m.sender_email || "Homeowner",
      homeowner_email: m.leads?.email || m.sender_email || null,
      lead_id: m.lead_id,
    };
  });

  // ===========================================================================
  // Estimates in stage + value in play
  // ===========================================================================
  const estimateStageStatuses = ["draft", "sent", "waiting", "viewed"];

  let estimatesInStageCount = 0;
  let valueInPlayToday = 0;
  let valueInPlayWeek = 0;
  let estimatesInStage: Array<{
    id: string;
    status: string | null;
    total: number;
    created_at: string;
    sent_at: string | null;
    homeowner_name: string | null;
    homeowner_email: string | null;
  }> = [];

  if (companyIds.length > 0) {
    const { count } = await admin
      .from("estimates")
      .select("id", { count: "exact", head: true })
      .in("company_id", companyIds)
      .in("status", estimateStageStatuses)
      .is("approved_at", null)
      .neq("status", "lost");

    estimatesInStageCount = count ?? 0;

    const todayStart = startOfTodayIso();
    const weekStart = daysAgoIso(7);

    const { data: todayEstimates } = await admin
      .from("estimates")
      .select("total")
      .in("company_id", companyIds)
      .in("status", estimateStageStatuses)
      .is("approved_at", null)
      .neq("status", "lost")
      .gte("created_at", todayStart)
      .limit(2000);

    valueInPlayToday = (todayEstimates ?? []).reduce((sum: number, e: any) => sum + num(e?.total), 0);

    const { data: weekEstimates } = await admin
      .from("estimates")
      .select("total")
      .in("company_id", companyIds)
      .in("status", estimateStageStatuses)
      .is("approved_at", null)
      .neq("status", "lost")
      .gte("created_at", weekStart)
      .limit(5000);

    valueInPlayWeek = (weekEstimates ?? []).reduce((sum: number, e: any) => sum + num(e?.total), 0);

    const { data: stageRows } = await admin
      .from("estimates")
      .select(
        `
        id,
        status,
        total,
        created_at,
        sent_at,
        homeowner:homeowners(name,email)
      `
      )
      .in("company_id", companyIds)
      .in("status", estimateStageStatuses)
      .is("approved_at", null)
      .neq("status", "lost")
      .order("sent_at", { ascending: true, nullsFirst: true })
      .order("created_at", { ascending: true })
      .limit(12);

    estimatesInStage = (stageRows ?? []).map((e: any) => ({
      id: e.id,
      status: e.status ?? null,
      total: num(e.total),
      created_at: e.created_at,
      sent_at: e.sent_at ?? null,
      homeowner_name: e.homeowner?.name ?? null,
      homeowner_email: e.homeowner?.email ?? null,
    }));
  }

  // ===========================================================================
  // Predictability signal (history only; no forecasts)
  // - Avg homeowners/week: leads created (last 8 weeks)
  // - Avg booked jobs/week: estimates approved (last 8 weeks)
  // ===========================================================================
  const weeksWindow = 8;
  const since8w = daysAgoIso(7 * weeksWindow);

  const { data: recentLeads } = await admin
    .from("leads")
    .select("created_at")
    .eq("workspace_id", workspaceId)
    .gte("created_at", since8w)
    .limit(5000);

  const avgHomeownersPerWeek = (recentLeads?.length ?? 0) / weeksWindow;

  let avgBookedJobsPerWeek = 0;
  if (companyIds.length > 0) {
    const { data: recentApproved } = await admin
      .from("estimates")
      .select("approved_at")
      .in("company_id", companyIds)
      .not("approved_at", "is", null)
      .gte("approved_at", since8w)
      .limit(5000);

    avgBookedJobsPerWeek = (recentApproved?.length ?? 0) / weeksWindow;
  }

  return NextResponse.json({
    ok: true,
    workspace_id: workspaceId,
    as_of: new Date().toISOString(),
    metrics: {
      hot_homeowners_waiting: hotHomeownersCount ?? 0,
      estimates_in_stage: estimatesInStageCount,
      value_in_play_today: Math.round(valueInPlayToday),
      value_in_play_week: Math.round(valueInPlayWeek),
      avg_homeowners_per_week: Number(avgHomeownersPerWeek.toFixed(1)),
      avg_booked_jobs_per_week: Number(avgBookedJobsPerWeek.toFixed(1)),
    },
    hot_homeowners: hotHomeowners,
    estimates: estimatesInStage,
  });
}








