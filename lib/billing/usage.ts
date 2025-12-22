import { createClient } from "@/lib/supabase/server";

export type WorkspaceUsage = {
  workspace_id: string;
  workspace_name: string;
  billing_plan: string | null;
  plan_name: string | null;
  daily_send_cap: number | null;
  monthly_send_cap: number | null;
  seat_limit: number | null;
  reply_cap: number | null;
  meeting_cap: number | null;
  seat_count: number;
  sends_today: number;
  replies_today: number;
  meetings_today: number;
  sends_month: number;
  replies_month: number;
  meetings_month: number;

  seats_used_pct: number | null;
  sends_today_pct: number | null;
  sends_month_pct: number | null;
  replies_month_pct: number | null;
  meetings_month_pct: number | null;

  seat_over_limit: boolean;
  sends_today_over_cap: boolean;
  sends_month_over_cap: boolean;
};

export type QuotaCheckResult = {
  allowed: boolean;
  reason?: string;          // "over_daily_cap" | "over_monthly_cap" | "ok"
  softWarning?: boolean;    // true if close to cap
  upgradeHint?: string;     // short message for UI/logging
  usage?: WorkspaceUsage;
};

export async function getWorkspaceUsage(
  workspaceId: string
): Promise<WorkspaceUsage | null> {
  const supabase = createClient();

  const { data, error } = await supabase
    .from("workspace_usage_summary")
    .select("*")
    .eq("workspace_id", workspaceId)
    .single();

  if (error || !data) return null;

  return data as WorkspaceUsage;
}

/**
 * Enforce plan caps for sending.
 * - If over daily or monthly send cap => allowed = false
 * - If over 90% => softWarning true (can be used by UI)
 */
export function checkSendQuota(
  usage: WorkspaceUsage,
  extraPlannedSends: number = 1
): QuotaCheckResult {
  const dailyCap = usage.daily_send_cap || null;
  const monthlyCap = usage.monthly_send_cap || null;

  const projectedToday = usage.sends_today + extraPlannedSends;
  const projectedMonth = usage.sends_month + extraPlannedSends;

  const pct = (used: number, cap: number | null) =>
    !cap || cap <= 0 ? null : Math.round((used / cap) * 100);

  const todayPct = pct(projectedToday, dailyCap);
  const monthPct = pct(projectedMonth, monthlyCap);

  // Hard stops
  if (dailyCap && projectedToday > dailyCap) {
    return {
      allowed: false,
      reason: "over_daily_cap",
      usage: {
        ...usage,
        sends_today: projectedToday,
        sends_today_pct: todayPct,
      } as any,
      upgradeHint: "You've reached your daily send cap for this plan.",
    };
  }

  if (monthlyCap && projectedMonth > monthlyCap) {
    return {
      allowed: false,
      reason: "over_monthly_cap",
      usage: {
        ...usage,
        sends_month: projectedMonth,
        sends_month_pct: monthPct,
      } as any,
      upgradeHint: "You've reached your monthly send cap for this plan.",
    };
  }

  // Soft warning if > 90% of monthly cap
  const softWarning =
    (monthPct !== null && monthPct >= 90) ||
    (todayPct !== null && todayPct >= 90);

  let upgradeHint: string | undefined;
  if (softWarning) {
    upgradeHint =
      "You're close to your send cap. Consider upgrading your SmartSend plan to avoid interruptions.";
  }

  return {
    allowed: true,
    reason: "ok",
    softWarning,
    upgradeHint,
    usage: {
      ...usage,
      sends_today: projectedToday,
      sends_today_pct: todayPct,
      sends_month: projectedMonth,
      sends_month_pct: monthPct,
    } as any,
  };
}







