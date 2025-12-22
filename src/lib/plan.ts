// lib/plan.ts
// Block 8470 — AI Feature Gating by Plan (Free vs Pro Features)

export type PlanName = "free" | "pro" | "enterprise" | "unknown";

export interface PlanInfo {
  plan: PlanName;
  status: string; // 'active', 'trialing', 'past_due', 'canceled', etc.
}

export function normalizePlan(plan?: string | null, status?: string | null): PlanInfo {
  const rawPlan = (plan ?? "free").toLowerCase() as PlanName;
  const rawStatus = (status ?? "inactive").toLowerCase();

  // For now we only care about Pro being active/trialing
  if (rawPlan === "pro" && ["active", "trialing"].includes(rawStatus)) {
    return { plan: "pro", status: rawStatus };
  }

  if (rawPlan === "enterprise" && ["active", "trialing"].includes(rawStatus)) {
    return { plan: "enterprise", status: rawStatus };
  }

  if (rawPlan === "free") {
    return { plan: "free", status: rawStatus };
  }

  return { plan: "unknown", status: rawStatus };
}

export function hasProAI(planInfo: PlanInfo): boolean {
  // any paid tier that should unlock AI features
  return planInfo.plan === "pro" || planInfo.plan === "enterprise";
}
