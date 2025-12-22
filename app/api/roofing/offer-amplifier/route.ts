import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

type Plan = "starter" | "growth" | "domination";

const PLAN_PRICES_USD: Record<Plan, number> = {
  starter: 99,
  growth: 199,
  domination: 399,
};

function startOfLocalTodayIso() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
}

function daysSince(dateIso: string | null | undefined) {
  if (!dateIso) return 0;
  const t = new Date(dateIso).getTime();
  if (!Number.isFinite(t)) return 0;
  const diff = Date.now() - t;
  if (diff < 0) return 0;
  return Math.floor(diff / 86_400_000) + 1;
}

function safeNumber(n: any) {
  const x = typeof n === "number" ? n : n == null ? 0 : Number(n);
  return Number.isFinite(x) ? x : 0;
}

async function resolveCompanyId(supabase: any, userId: string): Promise<{ id: string; name: string; workspace_id: string | null } | null> {
  // Prefer explicit membership (multi-company safe)
  const { data: membership } = await supabase
    .from("roofing_company_members")
    .select("roofing_company_id")
    .eq("user_id", userId)
    .eq("is_active", true)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  const memberCompanyId = membership?.roofing_company_id as string | undefined;
  if (memberCompanyId) {
    const { data: company } = await supabase
      .from("roofing_companies")
      .select("id, name, workspace_id")
      .eq("id", memberCompanyId)
      .eq("is_active", true)
      .maybeSingle();
    if (company?.id) return company as any;
  }

  // Fallback: first active company owned by user
  const { data: owned } = await supabase
    .from("roofing_companies")
    .select("id, name, workspace_id")
    .eq("owner_id", userId)
    .eq("is_active", true)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  return (owned?.id ? (owned as any) : null) as any;
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

    const company = await resolveCompanyId(supabase, user.id);
    if (!company?.id) {
      return NextResponse.json({ should_show: false, reason: "no_company" });
    }

    const companyId = company.id as string;
    const todayStartIso = startOfLocalTodayIso();

    // Trial day (company_subscriptions if present, else beta_testers trial)
    let trialDay = 0;
    let subscriptionStatus = "trial";
    let subscriptionPlan: Plan = "starter";
    try {
      const { data: sub } = await supabase
        .from("company_subscriptions")
        .select("status, plan, started_at, created_at")
        .eq("company_id", companyId)
        .maybeSingle();

      subscriptionStatus = (sub?.status as string | undefined) || "trial";
      subscriptionPlan = ((sub?.plan as Plan | undefined) || "starter") as Plan;
      trialDay = subscriptionStatus === "trial" ? daysSince(sub?.started_at || sub?.created_at) : 0;
    } catch {
      // best-effort: beta_testers trial
      try {
        if (company.workspace_id) {
          const { data: bt } = await supabase
            .from("beta_testers")
            .select("trial_started_at, trial_ends_at")
            .eq("workspace_id", company.workspace_id)
            .limit(1)
            .maybeSingle();
          trialDay = daysSince(bt?.trial_started_at);
        } else {
          trialDay = 0;
        }
      } catch {
        trialDay = 0;
      }
    }

    // Estimates sent / jobs approved / revenue closed (all-time, company scoped)
    const [{ count: estimatesSent }, { count: jobsApproved }, { data: approvedTotals }] = await Promise.all([
      supabase
        .from("estimates")
        .select("id", { count: "exact", head: true })
        .eq("company_id", companyId)
        .in("status", ["sent", "approved", "won"]),
      supabase
        .from("estimates")
        .select("id", { count: "exact", head: true })
        .eq("company_id", companyId)
        .in("status", ["approved", "won"]),
      supabase
        .from("estimates")
        .select("total_price")
        .eq("company_id", companyId)
        .in("status", ["approved", "won"])
        .not("total_price", "is", null),
    ]);

    const estimatesSentAllTime = estimatesSent ?? 0;
    const jobsApprovedAllTime = jobsApproved ?? 0;
    const revenueClosedAllTime = (approvedTotals || []).reduce((sum: number, r: any) => sum + safeNumber(r.total_price), 0);

    // Avg time saved (conservative): baseline 24h - avg(created_at -> sent_at) if sent_at exists
    let avgTimeSavedMin: number | null = null;
    try {
      const { data: speedRows } = await supabase
        .from("estimates")
        .select("created_at, sent_at")
        .eq("company_id", companyId)
        .not("sent_at", "is", null)
        .limit(200);

      const diffs = (speedRows || [])
        .map((r: any) => {
          const a = r?.created_at ? new Date(r.created_at).getTime() : NaN;
          const b = r?.sent_at ? new Date(r.sent_at).getTime() : NaN;
          const diffMin = (b - a) / 60000;
          return Number.isFinite(diffMin) && diffMin >= 0 ? diffMin : null;
        })
        .filter((x: any) => x != null) as number[];

      const avgSendSpeedMin = diffs.length ? diffs.reduce((a, b) => a + b, 0) / diffs.length : null;
      const baselineMin = 24 * 60;
      avgTimeSavedMin = avgSendSpeedMin == null ? null : Math.max(0, Math.floor(baselineMin - avgSendSpeedMin));
    } catch {
      avgTimeSavedMin = null;
    }

    // Jobs recovered (best-effort): approved_at > last_followup_sent_at
    let jobsRecovered = 0;
    try {
      const { data: approvedRows } = await supabase
        .from("estimates")
        .select("id, approved_at")
        .eq("company_id", companyId)
        .in("status", ["approved", "won"])
        .not("approved_at", "is", null);

      const ids = (approvedRows || []).map((r: any) => r.id).filter(Boolean);
      if (ids.length) {
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

        jobsRecovered = (approvedRows || []).reduce((acc: number, r: any) => {
          const approvedAt = r?.approved_at ? new Date(r.approved_at).getTime() : NaN;
          const lastFu = lastFollowupByEstimate.get(r.id);
          if (Number.isFinite(approvedAt) && lastFu != null && approvedAt > lastFu) return acc + 1;
          return acc;
        }, 0);
      }
    } catch {
      jobsRecovered = 0;
    }

    // Usage flags
    let followupsActive = false;
    try {
      const { count } = await supabase
        .from("estimate_followups")
        .select("id", { count: "exact", head: true })
        .eq("sent", false)
        .gte("created_at", new Date(Date.now() - 30 * 86_400_000).toISOString());
      followupsActive = (count ?? 0) > 0;
    } catch {
      followupsActive = false;
    }

    let outreachActive = false;
    try {
      if (company.workspace_id) {
        const { count } = await supabase
          .from("campaigns")
          .select("id", { count: "exact", head: true })
          .eq("workspace_id", company.workspace_id)
          .eq("status", "active");
        outreachActive = (count ?? 0) > 0;
      }
    } catch {
      outreachActive = false;
    }

    // case_study_generated (best-effort): any case_studies row matching company name
    let caseStudyGenerated = false;
    try {
      const { data: cs } = await supabase
        .from("case_studies")
        .select("id")
        .ilike("org_name", company.name)
        .limit(1);
      caseStudyGenerated = !!(cs && cs.length > 0);
    } catch {
      caseStudyGenerated = false;
    }

    // Decision Moment Detection (LOCKED)
    const triggers = {
      trial_day_ge_5: trialDay >= 5,
      estimates_sent_ge_3: estimatesSentAllTime >= 3,
      revenue_closed_gt_0: revenueClosedAllTime > 0,
      case_study_generated: caseStudyGenerated,
    };

    const anyTrigger =
      triggers.trial_day_ge_5 ||
      triggers.estimates_sent_ge_3 ||
      triggers.revenue_closed_gt_0 ||
      triggers.case_study_generated;

    if (!anyTrigger) {
      return NextResponse.json({ should_show: false, reason: "no_trigger", triggers });
    }

    // Respect "Pause" (7d) and "Dismiss" (once/day)
    const { data: lastImpression } = await supabase
      .from("offer_impressions")
      .select("id, shown_at, action_taken")
      .eq("company_id", companyId)
      .order("shown_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (lastImpression?.action_taken === "dismissed" && String(lastImpression?.shown_at) >= todayStartIso) {
      return NextResponse.json({ should_show: false, reason: "dismissed_today", triggers });
    }

    if (lastImpression?.action_taken === "paused") {
      const ts = lastImpression?.shown_at ? new Date(lastImpression.shown_at).getTime() : 0;
      if (ts && Date.now() - ts < 7 * 86_400_000) {
        return NextResponse.json({ should_show: false, reason: "paused", triggers });
      }
    }

    // Plan recommendation engine (SIMPLE)
    let planHighlighted: Plan = "growth";
    if (outreachActive && followupsActive && jobsApprovedAllTime > 3) {
      planHighlighted = "domination";
    } else if (outreachActive || followupsActive) {
      planHighlighted = "growth";
    } else if (estimatesSentAllTime <= 5) {
      planHighlighted = "starter";
    } else {
      planHighlighted = "growth";
    }

    const monthlyPlanPrice = PLAN_PRICES_USD[planHighlighted];
    const avgJobValue = jobsApprovedAllTime > 0 ? revenueClosedAllTime / jobsApprovedAllTime : 0;
    const monthsCovered = avgJobValue > 0 ? Math.floor(avgJobValue / monthlyPlanPrice) : 0;

    // Founder pricing eligibility (beta_testers record exists & not converted)
    let founderEligible = false;
    try {
      if (company.workspace_id) {
        const { data: bt } = await supabase
          .from("beta_testers")
          .select("id, converted_to_paid_at, beta_status, workspace_id")
          .eq("workspace_id", company.workspace_id)
          .limit(1)
          .maybeSingle();
        founderEligible = !!(bt?.id && !bt?.converted_to_paid_at && bt?.beta_status && bt.beta_status !== "cancelled");
      } else {
        founderEligible = false;
      }
    } catch {
      founderEligible = false;
    }

    const triggerReason = triggers.case_study_generated
      ? "case_study_generated"
      : triggers.revenue_closed_gt_0
        ? "revenue_closed"
        : triggers.estimates_sent_ge_3
          ? "estimates_sent"
          : "trial_day";

    // Log impression once per day
    const { data: todayExisting } = await supabase
      .from("offer_impressions")
      .select("id")
      .eq("company_id", companyId)
      .gte("shown_at", todayStartIso)
      .order("shown_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    let impressionId = todayExisting?.id as string | undefined;
    if (!impressionId) {
      const { data: ins } = await supabase
        .from("offer_impressions")
        .insert({
          company_id: companyId,
          trigger_reason: triggerReason,
          plan_highlighted: planHighlighted,
          action_taken: "none",
        })
        .select("id")
        .single();

      impressionId = ins?.id as string | undefined;
    }

    return NextResponse.json({
      should_show: true,
      company_id: companyId,
      impression_id: impressionId || null,
      trigger_reason: triggerReason,
      triggers,
      plan_highlighted: planHighlighted,
      founder_eligible: founderEligible,
      metrics: {
        estimates_sent: estimatesSentAllTime,
        jobs_approved: jobsApprovedAllTime,
        revenue_closed: revenueClosedAllTime,
        jobs_recovered: jobsRecovered,
        avg_time_saved_min: avgTimeSavedMin,
      },
      cost_reframe: {
        avg_job_value: avgJobValue,
        monthly_plan_price: monthlyPlanPrice,
        months_covered: monthsCovered,
      },
      usage: {
        outreach_active: outreachActive,
        followups_active: followupsActive,
      },
      subscription: {
        status: subscriptionStatus,
        plan: subscriptionPlan,
        trial_day: trialDay,
      },
    });
  } catch (error: any) {
    console.error("Error in /api/roofing/offer-amplifier:", error);
    return NextResponse.json({ error: error?.message || "Internal server error" }, { status: 500 });
  }
}









