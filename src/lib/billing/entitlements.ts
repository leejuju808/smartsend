export type Plan = "starter" | "pro" | "enterprise";

export type Entitlements = {
  plan: Plan;
  maxCampaigns: number;
  maxImportRows: number;
};

export const PLAN_LIMITS: Record<Plan, Entitlements> = {
  starter: { plan: "starter", maxCampaigns: 1,    maxImportRows: 2000 },
  pro:     { plan: "pro",     maxCampaigns: 10,   maxImportRows: 10000 },
  enterprise: { plan: "enterprise", maxCampaigns: 1000, maxImportRows: 100000 }
};

// /lib/billing/entitlements.ts
import { supabaseAdmin } from "@/lib/supabase/server";
import { PLANS, PlanId } from "./plans";

export type Entitlement = {
  plan: PlanId;
  status: "active" | "trialing" | "past_due" | "canceled" | "incomplete" | "unpaid" | "none";
  monthlyCap: number;
  emailsSentThisPeriod: number;
  canUse(feature: string): boolean;
};

export async function getEntitlements(workspace_id: string): Promise<Entitlement> {
  const supabase = supabaseAdmin();

  // subscription row (may not exist)
  const { data: sub } = await supabase
    .from("billing_subscriptions")
    .select("*")
    .eq("workspace_id", workspace_id)
    .maybeSingle();

  const plan: PlanId = (sub?.plan as PlanId) ?? "free";
  const planCfg = PLANS[plan];

  // usage in current period (for cap)
  const periodStart = sub?.current_period_start ?? new Date(new Date().getFullYear(), new Date().getMonth(), 1);
  const { count } = await supabase
    .from("email_logs")
    .select("*", { count: "exact", head: true })
    .eq("workspace_id", workspace_id)
    .eq("status", "sent")
    .gte("sent_at", new Date(periodStart).toISOString());

  const emailsSentThisPeriod = count ?? 0;

  return {
    plan,
    status: (sub?.status as any) ?? "active",
    monthlyCap: planCfg.monthlyCap,
    emailsSentThisPeriod,
    canUse: (feature: string) => {
      return planCfg.features.includes(feature) || plan === "scale" || plan === "pro"; // simple example
    }
  };
}

export async function assertCanSend(workspace_id: string) {
  const e = await getEntitlements(workspace_id);
  if (e.emailsSentThisPeriod >= e.monthlyCap) {
    throw new Error(`Monthly send cap reached for ${e.plan} plan (${e.monthlyCap}).`);
  }
}