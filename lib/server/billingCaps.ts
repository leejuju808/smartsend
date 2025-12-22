// lib/server/billingCaps.ts
import { createClient } from "@/lib/supabase/server";

export type PlanTier = "free" | "starter" | "pro";

export type PlanCaps = {
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

export async function getWorkspacePlanCaps(workspaceId: string) {
  const supabase = createClient();

  // 1) Load workspace plan_tier
  const { data: workspace, error: wsErr } = await supabase
    .from("workspaces")
    .select("id, plan_tier")
    .eq("id", workspaceId)
    .single();

  if (wsErr || !workspace) {
    throw new Error("workspace_not_found");
  }

  const rawTier: string | null = (workspace as any).plan_tier ?? "free";
  const planTier: PlanTier =
    rawTier === "starter" || rawTier === "pro" ? (rawTier as PlanTier) : "free";

  // 2) Try to read caps from billing_plans
  const { data: planRow, error: planErr } = await supabase
    .from("billing_plans")
    .select(
      "plan_key, seat_limit, daily_send_cap, monthly_send_cap, monthly_reply_cap"
    )
    .eq("plan_key", planTier)
    .single();

  if (planErr || !planRow) {
    console.warn(
      "[getWorkspacePlanCaps] billing_plans not found for plan_tier:",
      planTier,
      "using fallback caps"
    );
    return {
      planTier,
      caps: FALLBACK_PLAN_DEFS[planTier],
    };
  }

  const label =
    planTier === "free"
      ? "Free"
      : planTier === "starter"
      ? "Starter"
      : "Pro";

  const caps: PlanCaps = {
    label,
    seat_limit: planRow.seat_limit,
    daily_send_cap: planRow.daily_send_cap,
    monthly_send_cap: planRow.monthly_send_cap,
    monthly_reply_cap: planRow.monthly_reply_cap,
  };

  return {
    planTier,
    caps,
  };
}




