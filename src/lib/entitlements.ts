export type Entitlements = {
  plan: "free" | "pro";
  daily_limit: number;
  max_sequences: number; // non-demo
  max_steps_per_sequence: number;
};

export function getEntitlements(planRaw: string | undefined | null): Entitlements {
  const plan = planRaw === "pro" ? "pro" : "free";
  if (plan === "pro") {
    return { plan, daily_limit: 500, max_sequences: 1000, max_steps_per_sequence: 20 };
  }
  return { plan, daily_limit: 50, max_sequences: 1, max_steps_per_sequence: 3 };
}

