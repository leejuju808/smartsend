import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getActiveWorkspaceId } from "@/lib/workspace/context";

function startOfMonthUtc(d: Date) {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1, 0, 0, 0, 0));
}

function startOfNextMonthUtc(d: Date) {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1, 0, 0, 0, 0));
}

function startOfWeekMondayUtc(d: Date) {
  const date = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 0, 0, 0, 0));
  // JS: Sunday=0..Saturday=6. Convert so Monday=0..Sunday=6.
  const day = (date.getUTCDay() + 6) % 7;
  date.setUTCDate(date.getUTCDate() - day);
  return date;
}

function monthlyFeeForPlanId(planId: string | null | undefined): number {
  const key = (planId || "").toLowerCase();
  if (!key || key === "free" || key === "trial") return 0;
  if (key === "starter") return 99;
  if (key === "growth") return 199;
  if (key === "domination") return 399;
  if (key === "basic") return 99;
  if (key === "pro") return 199;
  if (key === "scale") return 399;
  return 99;
}

async function getCompanyIdsForWorkspace(args: { supabase: any; workspaceId: string }) {
  const { supabase, workspaceId } = args;
  const { data, error } = await supabase.from("roofing_companies").select("id").eq("workspace_id", workspaceId);
  if (error) throw error;
  const ids = (data || []).map((r: any) => String(r.id || "")).filter(Boolean);
  return ids;
}

async function approvedEstimatesInRange(args: {
  supabase: any;
  companyIds: string[];
  fromIso: string;
  toIso: string;
  originSource?: "smartsend" | null;
}) {
  const { supabase, companyIds, fromIso, toIso, originSource } = args;

  let q = supabase
    .from("estimates")
    .select("id,total,origin_source", { count: "exact" })
    .in("company_id", companyIds.length ? companyIds : ["00000000-0000-0000-0000-000000000000"])
    .not("approved_at", "is", null)
    .gte("approved_at", fromIso)
    .lt("approved_at", toIso);

  if (originSource === "smartsend") q = q.eq("origin_source", "smartsend");
  if (originSource === null) q = q.is("origin_source", null);

  const { data, count, error } = await q;
  if (error) throw error;

  const revenue = (data || []).reduce((sum: number, r: any) => sum + (Number(r.total) || 0), 0);
  return { jobs: count ?? (data?.length ?? 0), revenue };
}

export async function GET() {
  try {
    const supabase = createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }

    const workspaceId = await getActiveWorkspaceId();
    if (!workspaceId) {
      return NextResponse.json({ error: "no_workspace" }, { status: 400 });
    }

    const now = new Date();
    const monthStart = startOfMonthUtc(now);
    const monthEndExclusive = startOfNextMonthUtc(now);
    const weekStart = startOfWeekMondayUtc(now);

    const [companyIds, billingState] = await Promise.all([
      getCompanyIdsForWorkspace({ supabase, workspaceId }),
      supabase
        .from("workspace_billing_state")
        .select("plan_id")
        .eq("workspace_id", workspaceId)
        .maybeSingle(),
    ]);

    const smartSendCostThisMonth = monthlyFeeForPlanId((billingState as any)?.data?.plan_id);

    const [mtdSmartSend, weekSmartSend, weekTotal] = await Promise.all([
      approvedEstimatesInRange({
        supabase,
        companyIds,
        fromIso: monthStart.toISOString(),
        toIso: monthEndExclusive.toISOString(),
        originSource: "smartsend",
      }),
      approvedEstimatesInRange({
        supabase,
        companyIds,
        fromIso: weekStart.toISOString(),
        toIso: now.toISOString(),
        originSource: "smartsend",
      }),
      approvedEstimatesInRange({
        supabase,
        companyIds,
        fromIso: weekStart.toISOString(),
        toIso: now.toISOString(),
      }),
    ]);

    const otherJobsWeek = Math.max(0, (weekTotal.jobs || 0) - (weekSmartSend.jobs || 0));
    const otherRunning = otherJobsWeek > 0;

    const spendPerDollarEarned =
      mtdSmartSend.revenue > 0 ? smartSendCostThisMonth / mtdSmartSend.revenue : null;

    return NextResponse.json({
      workspace_id: workspaceId,
      as_of: now.toISOString(),
      month: {
        start: monthStart.toISOString(),
        end_exclusive: monthEndExclusive.toISOString(),
      },
      top_line: {
        smartsend_jobs_mtd: mtdSmartSend.jobs,
        smartsend_revenue_mtd: Math.round(mtdSmartSend.revenue),
      },
      comparison: {
        week_start: weekStart.toISOString(),
        smartsend_jobs_week: weekSmartSend.jobs,
        other_jobs_week: otherJobsWeek,
        show: otherRunning,
      },
      efficiency: {
        smartsend_cost_mtd: smartSendCostThisMonth,
        spend_per_dollar_earned: spendPerDollarEarned,
      },
    });
  } catch (error: any) {
    console.error("proof-of-dominance route error:", error);
    return NextResponse.json({ error: error?.message || "Internal server error" }, { status: 500 });
  }
}




