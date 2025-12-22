import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";

type SubscriptionPanel = {
  plan: string;
  renewal_date: string | null;
  status: string;
  is_active: boolean;
};

function monthStartIso(d = new Date()) {
  const start = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1, 0, 0, 0, 0));
  return start.toISOString();
}

function safeNumber(n: any): number {
  const x = typeof n === "number" ? n : n == null ? 0 : Number(n);
  return Number.isFinite(x) ? x : 0;
}

async function getCurrentOrgId(supabase: any, userId: string): Promise<string | null> {
  const cookieStore = await cookies();
  const orgId = cookieStore.get("current_org_id")?.value || cookieStore.get("org_id")?.value;
  if (orgId) return orgId;

  const { data: membership } = await supabase
    .from("org_members")
    .select("org_id")
    .eq("user_id", userId)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  return membership?.org_id || null;
}

async function loadSubscriptionPanel(supabase: any, userId: string): Promise<SubscriptionPanel> {
  // Prefer org billing (newer system), fallback to user billing_accounts if org not found.
  const orgId = await getCurrentOrgId(supabase, userId);

  if (orgId) {
    const { data: billingInfo } = await supabase.rpc("get_org_billing_info", { p_org_id: orgId });
    const billing = billingInfo?.[0];

    const planMap: Record<string, string> = {
      trial: "Trial",
      starter: "Starter",
      growth: "Growth",
      domination: "Domination",
    };

    const status = String(billing?.subscription_status || "trialing");
    const isActive = status === "active" || status === "trialing";

    return {
      plan: planMap[String(billing?.current_plan || "trial")] || "Trial",
      renewal_date: billing?.current_period_end || null,
      status,
      is_active: isActive,
    };
  }

  // Fallback path (older single-user billing)
  const { data: ba } = await supabase
    .from("billing_accounts")
    .select("status, period_end, plan:billing_plans(name)")
    .eq("user_id", userId)
    .maybeSingle();

  const status = String(ba?.status || "trialing");
  const isActive = status === "active" || status === "trialing";

  return {
    plan: String((ba as any)?.plan?.name || "Trial"),
    renewal_date: ba?.period_end || null,
    status,
    is_active: isActive,
  };
}

export async function GET() {
  try {
    const supabase = createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const startIso = monthStartIso();

    const [
      { count: estimatesSentThisMonth },
      { count: estimatesApprovedThisMonth },
      { data: approvedTotals },
      { data: sendSpeedRows },
      { data: closeSpeedRows },
    ] = await Promise.all([
      supabase
        .from("estimates")
        .select("id", { count: "exact", head: true })
        .not("sent_at", "is", null)
        .gte("sent_at", startIso),
      supabase
        .from("estimates")
        .select("id", { count: "exact", head: true })
        .eq("status", "approved")
        .not("approved_at", "is", null)
        .gte("approved_at", startIso),
      supabase
        .from("estimates")
        .select("total")
        .eq("status", "approved")
        .not("approved_at", "is", null)
        .gte("approved_at", startIso),
      supabase
        .from("estimates")
        .select("created_at, sent_at")
        .not("sent_at", "is", null)
        .gte("sent_at", startIso),
      supabase
        .from("estimates")
        .select("sent_at, approved_at")
        .eq("status", "approved")
        .not("approved_at", "is", null)
        .gte("approved_at", startIso),
    ]);

    const sentCount = estimatesSentThisMonth ?? 0;
    const approvedCount = estimatesApprovedThisMonth ?? 0;
    const approvalPct = sentCount > 0 ? approvedCount / sentCount : 0;

    const revenueClosed = (approvedTotals || []).reduce((sum: number, r: any) => sum + safeNumber(r.total), 0);

    // Avg send speed: created_at -> sent_at (minutes)
    const sendDiffs = (sendSpeedRows || [])
      .map((r: any) => {
        const a = r?.created_at ? new Date(r.created_at).getTime() : NaN;
        const b = r?.sent_at ? new Date(r.sent_at).getTime() : NaN;
        const diffMin = (b - a) / 60000;
        return Number.isFinite(diffMin) && diffMin >= 0 ? diffMin : null;
      })
      .filter((x: any) => x != null) as number[];
    const avgSendSpeedMin = sendDiffs.length ? sendDiffs.reduce((a, b) => a + b, 0) / sendDiffs.length : null;

    // Avg close speed: sent_at -> approved_at (minutes)
    const closeDiffs = (closeSpeedRows || [])
      .map((r: any) => {
        const a = r?.sent_at ? new Date(r.sent_at).getTime() : NaN;
        const b = r?.approved_at ? new Date(r.approved_at).getTime() : NaN;
        const diffMin = (b - a) / 60000;
        return Number.isFinite(diffMin) && diffMin >= 0 ? diffMin : null;
      })
      .filter((x: any) => x != null) as number[];
    const avgCloseSpeedMin = closeDiffs.length ? closeDiffs.reduce((a, b) => a + b, 0) / closeDiffs.length : null;

    // Jobs recovered by follow-up:
    // recovered = approved_at > last_followup_at (last sent followup)
    let recoveredCount = 0;
    try {
      const { data: approvedRows } = await supabase
        .from("estimates")
        .select("id, approved_at")
        .eq("status", "approved")
        .not("approved_at", "is", null)
        .gte("approved_at", startIso);

      const approved = (approvedRows || []).filter((r: any) => r?.id && r?.approved_at);
      const ids = approved.map((r: any) => r.id);

      if (ids.length) {
        // estimate_followups is part of the roofing pipeline system (may not exist in all DBs),
        // so we treat it as best-effort. If it exists, it unlocks the "recovered jobs" proof.
        const { data: followups } = await supabase
          .from("estimate_followups")
          .select("estimate_id, sent_at, sent")
          .in("estimate_id", ids)
          .eq("sent", true)
          .not("sent_at", "is", null);

        const lastFollowupByEstimate = new Map<string, number>();
        for (const f of followups || []) {
          const id = (f as any).estimate_id as string | undefined;
          const ts = (f as any).sent_at ? new Date((f as any).sent_at).getTime() : NaN;
          if (!id || !Number.isFinite(ts)) continue;
          const prev = lastFollowupByEstimate.get(id);
          if (prev == null || ts > prev) lastFollowupByEstimate.set(id, ts);
        }

        recoveredCount = approved.reduce((acc: number, r: any) => {
          const approvedAt = new Date(r.approved_at).getTime();
          const lastFu = lastFollowupByEstimate.get(r.id);
          if (lastFu != null && approvedAt > lastFu) return acc + 1;
          return acc;
        }, 0);
      }
    } catch {
      // If estimate_followups doesn't exist, recovered stays 0 (best-effort).
      recoveredCount = 0;
    }

    const subscription = await loadSubscriptionPanel(supabase, user.id);

    return NextResponse.json(
      {
        period: { month_start: startIso },
        top: {
          revenue_closed: revenueClosed,
          jobs_won: approvedCount,
          jobs_recovered: recoveredCount,
        },
        middle: {
          estimates_sent: sentCount,
          estimates_approved: approvedCount,
          approval_pct: approvalPct,
        },
        bottom: {
          avg_send_speed_min: avgSendSpeedMin,
          avg_close_speed_min: avgCloseSpeedMin,
        },
        subscription,
      },
      { headers: { "content-type": "application/json" } }
    );
  } catch (error: any) {
    console.error("Error in /api/revenue-proof:", error);
    return NextResponse.json({ error: error?.message || "Internal server error" }, { status: 500 });
  }
}










