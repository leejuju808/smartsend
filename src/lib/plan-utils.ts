export type PlanInfo = { plan: "free" | "pro" | "other"; limit: number };

export function getPlanInfo(subscription_status?: string | null): PlanInfo {
  const st = (subscription_status || "free").toLowerCase();
  if (st === "pro" || st === "active" || st === "trialing") {
    return {
      plan: "pro",
      limit: Number(process.env.PRO_MONTHLY_SEND_LIMIT || 100000),
    };
  }
  return {
    plan: st === "free" ? "free" : "other",
    limit: Number(process.env.FREE_MONTHLY_SEND_LIMIT || 50),
  };
}

export function monthWindow(now = new Date()) {
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1, 0, 0, 0));
  const next = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1, 0, 0, 0));
  return { start, end: next };
}

