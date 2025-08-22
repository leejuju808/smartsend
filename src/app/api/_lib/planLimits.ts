import { getDailySendCount, getUserProfile } from "./db";

const CAPS = { free: 50, pro: 500 } as const;
type Plan = keyof typeof CAPS;

function normalizePlan(p?: string): Plan {
  return p === "pro" ? "pro" : "free"; // treat unknown as free
}

export async function planLimitsMiddleware(_req: Request, ctx: { userId: string }) {
  const prof = await getUserProfile(ctx.userId);
  const plan = normalizePlan(prof?.subscription_status);
  const used = await getDailySendCount(ctx.userId);
  const limit = CAPS[plan];

  if (used >= limit) {
    return { allowed: false, status: 402, code: "LIMIT_EXCEEDED", plan, remaining: 0 };
  }
  return { allowed: true, plan, limit, remaining: limit - used };
}

export const __testables = { CAPS };

