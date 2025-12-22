import type { SupabaseClient } from "@supabase/supabase-js";

export type CompanyPlan = "starter" | "growth" | "domination";
export type CompanySubscriptionStatus = "trial" | "active" | "past_due" | "canceled";

export interface PaymentMomentGateResult {
  gated: boolean;
  estimatesSent: number;
  subscription: {
    plan: CompanyPlan;
    status: CompanySubscriptionStatus;
    renewed_at: string | null;
  } | null;
  reason?: "payment_required" | "past_due";
}

export async function getCompanyEstimatesSentCount(
  supabase: SupabaseClient,
  companyId: string
): Promise<number> {
  const { count, error } = await supabase
    .from("estimates_proposals")
    // Join estimates to filter by company_id; keep payload small with head:true
    .select("id, estimate:estimates!inner(company_id)", { count: "exact", head: true })
    .eq("status", "sent")
    .eq("estimate.company_id", companyId);

  if (error) {
    // If counting fails, fail open (don't block revenue actions on analytics errors)
    console.error("PaymentMoment: failed to count estimates_sent", error);
    return 0;
  }

  return count ?? 0;
}

export async function getCompanySubscription(
  supabase: SupabaseClient,
  companyId: string
): Promise<PaymentMomentGateResult["subscription"]> {
  const { data, error } = await supabase
    .from("company_subscriptions")
    .select("plan, status, renewed_at")
    .eq("company_id", companyId)
    .maybeSingle();

  if (error || !data) return null;
  return {
    plan: data.plan as CompanyPlan,
    status: data.status as CompanySubscriptionStatus,
    renewed_at: data.renewed_at ?? null,
  };
}

/**
 * Canonical rule (v1):
 * - Gate activates after a company has sent >= 3 estimates/proposals
 * - Once activated, actions are blocked unless subscription.status === 'active'
 */
export async function checkCompanyPaymentMomentGate(
  supabase: SupabaseClient,
  companyId: string
): Promise<PaymentMomentGateResult> {
  const [estimatesSent, subscription] = await Promise.all([
    getCompanyEstimatesSentCount(supabase, companyId),
    getCompanySubscription(supabase, companyId),
  ]);

  const status = subscription?.status ?? "trial";

  if (estimatesSent >= 3 && status !== "active") {
    return {
      gated: true,
      estimatesSent,
      subscription,
      reason: status === "past_due" ? "past_due" : "payment_required",
    };
  }

  return { gated: false, estimatesSent, subscription };
}










