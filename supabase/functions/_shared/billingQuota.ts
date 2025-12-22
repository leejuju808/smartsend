import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

type PlanTier = "free" | "starter" | "pro";

type PlanCaps = {
  label: string;
  seat_limit: number;
  daily_send_cap: number;
  monthly_send_cap: number;
  monthly_reply_cap: number;
};

const FALLBACK_PLAN_DEFS: Record<PlanTier, PlanCaps> = {
  free: {
    label: "Free",
    seat_limit: 1,
    daily_send_cap: 200,
    monthly_send_cap: 3000,
    monthly_reply_cap: 300,
  },
  starter: {
    label: "Starter",
    seat_limit: 3,
    daily_send_cap: 500,
    monthly_send_cap: 10000,
    monthly_reply_cap: 1500,
  },
  pro: {
    label: "Pro",
    seat_limit: 10,
    daily_send_cap: 2000,
    monthly_send_cap: 60000,
    monthly_reply_cap: 6000,
  },
};

async function fetchPlanCaps(
  supabase: SupabaseClient,
  planTier: PlanTier
): Promise<PlanCaps> {
  const { data, error } = await supabase
    .from("billing_plans")
    .select(
      "plan_key, seat_limit, daily_send_cap, monthly_send_cap, monthly_reply_cap"
    )
    .eq("plan_key", planTier)
    .single();

  if (error || !data) {
    console.warn(
      "[billingQuota] billing_plans not found for plan_tier:",
      planTier,
      "using fallback caps"
    );
    return FALLBACK_PLAN_DEFS[planTier];
  }

  return {
    label:
      planTier === "free"
        ? "Free"
        : planTier === "starter"
        ? "Starter"
        : "Pro",
    seat_limit: data.seat_limit,
    daily_send_cap: data.daily_send_cap,
    monthly_send_cap: data.monthly_send_cap,
    monthly_reply_cap: data.monthly_reply_cap,
  };
}

export type WorkspaceQuotaCaps = {
  seat_limit: number;
  daily_send_cap: number;
  monthly_send_cap: number;
  monthly_reply_cap: number;
};

export type WorkspaceQuotaUsage = {
  seats_used: number;
  sends_today: number;
  sends_30d: number;
  replies_30d: number;
  seat_pct: number;
  daily_send_pct: number;
  monthly_send_pct: number;
  monthly_reply_pct: number;
};

export type WorkspaceQuotaSnapshot = {
  plan_tier: PlanTier;
  plan_label: string;
  caps: WorkspaceQuotaCaps;
  usage: WorkspaceQuotaUsage;
};

export type QuotaCheckResult = {
  allowed: boolean;
  reason?: string;
  snapshot: WorkspaceQuotaSnapshot;
};

export async function getWorkspaceQuotaSnapshot(
  supabase: SupabaseClient,
  workspaceId: string
): Promise<WorkspaceQuotaSnapshot> {
  // workspace.plan_tier (check both plan_tier and plan columns)
  const { data: workspace, error: wsErr } = await supabase
    .from("workspaces")
    .select("id, plan_tier, plan")
    .eq("id", workspaceId)
    .single();

  if (wsErr || !workspace) {
    throw new Error("workspace_not_found");
  }

  const rawTier: string | null =
    (workspace as any).plan_tier ?? (workspace as any).plan ?? "free";
  const planTier: PlanTier =
    rawTier === "starter" || rawTier === "pro" ? (rawTier as PlanTier) : "free";

  const plan = await fetchPlanCaps(supabase, planTier);

  const now = new Date();
  const todayStartIso = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate()
  ).toISOString();

  const thirtyDaysAgoIso = new Date(
    now.getTime() - 30 * 24 * 60 * 60 * 1000
  ).toISOString();

  // seats
  const { data: members, error: memberErr } = await supabase
    .from("team_members")
    .select("id")
    .eq("workspace_id", workspaceId);

  if (memberErr) {
    throw new Error("team_members_query_failed");
  }

  const seatsUsed = (members || []).length;

  // sends today
  const { data: sendsToday, error: sendsTodayErr } = await supabase
    .from("send_logs")
    .select("id")
    .eq("workspace_id", workspaceId)
    .eq("status", "sent")
    .gte("sent_at", todayStartIso);

  if (sendsTodayErr) {
    throw new Error("send_logs_today_query_failed");
  }

  const sendsTodayCount = (sendsToday || []).length;

  // sends last 30 days
  const { data: sends30d, error: sends30dErr } = await supabase
    .from("send_logs")
    .select("id")
    .eq("workspace_id", workspaceId)
    .eq("status", "sent")
    .gte("sent_at", thirtyDaysAgoIso);

  if (sends30dErr) {
    throw new Error("send_logs_30d_query_failed");
  }

  const sends30dCount = (sends30d || []).length;

  // replies last 30 days
  const { data: replies30d, error: replies30dErr } = await supabase
    .from("reply_logs")
    .select("id")
    .eq("workspace_id", workspaceId)
    .gte("received_at", thirtyDaysAgoIso);

  if (replies30dErr) {
    throw new Error("reply_logs_30d_query_failed");
  }

  const replies30dCount = (replies30d || []).length;

  const pct = (used: number, cap: number) => {
    if (!cap || cap <= 0) return 0;
    return Math.min(100, Math.round((used / cap) * 100));
  };

  const usage: WorkspaceQuotaUsage = {
    seats_used: seatsUsed,
    sends_today: sendsTodayCount,
    sends_30d: sends30dCount,
    replies_30d: replies30dCount,
    seat_pct: pct(seatsUsed, plan.seat_limit),
    daily_send_pct: pct(sendsTodayCount, plan.daily_send_cap),
    monthly_send_pct: pct(sends30dCount, plan.monthly_send_cap),
    monthly_reply_pct: pct(replies30dCount, plan.monthly_reply_cap),
  };

  const caps: WorkspaceQuotaCaps = {
    seat_limit: plan.seat_limit,
    daily_send_cap: plan.daily_send_cap,
    monthly_send_cap: plan.monthly_send_cap,
    monthly_reply_cap: plan.monthly_reply_cap,
  };

  return {
    plan_tier: planTier,
    plan_label: plan.label,
    caps,
    usage,
  };
}

export async function checkWorkspaceQuota(
  supabase: SupabaseClient,
  workspaceId: string
): Promise<QuotaCheckResult> {
  const snapshot = await getWorkspaceQuotaSnapshot(supabase, workspaceId);
  const { caps, usage } = snapshot;

  // Hard blocks — you can tune these thresholds
  if (usage.seats_used > caps.seat_limit) {
    return {
      allowed: false,
      reason: "seat_limit_exceeded",
      snapshot,
    };
  }

  if (usage.sends_today >= caps.daily_send_cap) {
    return {
      allowed: false,
      reason: "daily_send_cap_reached",
      snapshot,
    };
  }

  if (usage.sends_30d >= caps.monthly_send_cap) {
    return {
      allowed: false,
      reason: "monthly_send_cap_reached",
      snapshot,
    };
  }

  if (usage.replies_30d >= caps.monthly_reply_cap) {
    return {
      allowed: false,
      reason: "monthly_reply_cap_reached",
      snapshot,
    };
  }

  // If below caps → allowed
  return {
    allowed: true,
    snapshot,
  };
}

