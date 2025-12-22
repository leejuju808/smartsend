// lib/entitlements.ts
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";

type RpcEntitlements = {
  plan: string;
  status: string;
  period_end: string | null;
  seats: number | null;
  feature_flags: Record<string, unknown> | null;
  monthly_sends: number | null;
  monthly_ai_actions: number | null;
  max_campaigns: number | null;
  max_seats: number | null;
  used_sends: number | null;
  used_ai_actions: number | null;
};

export type EntitlementSummary = {
  plan: string;
  status: string;
  periodEnd: string | null;
  seats: number;
  featureFlags: Record<string, unknown>;
  used: { sends: number; ai: number };
  limits: {
    sends: number;
    ai: number;
    maxCampaigns: number;
    maxSeats: number;
  };
  pct: { sends: number; ai: number };
};

async function getServerSupabase() {
  const cookieStore = await cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return cookieStore.get(name)?.value;
        },
        set(name: string, value: string, options: any) {
          cookieStore.set({ name, value, ...options });
        },
        remove(name: string, options: any) {
          cookieStore.set({ name, value: "", ...options });
        },
      },
    },
  );
}

export async function getEntitlements(): Promise<EntitlementSummary> {
  const supabase = await getServerSupabase();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    throw new Error("Unauthorized");
  }

  const { data, error } = await supabase.rpc("get_entitlements");
  if (error) throw new Error(error.message);

  const ent = data as RpcEntitlements;
  const used = {
    sends: Number(ent?.used_sends ?? 0),
    ai: Number(ent?.used_ai_actions ?? 0),
  };
  const limits = {
    sends: Number(ent?.monthly_sends ?? 0),
    ai: Number(ent?.monthly_ai_actions ?? 0),
    maxCampaigns: Number(ent?.max_campaigns ?? 0),
    maxSeats: Number(ent?.max_seats ?? 0),
  };
  const pct = {
    sends: limits.sends
      ? Math.min(100, Math.round((used.sends / limits.sends) * 100))
      : 0,
    ai: limits.ai ? Math.min(100, Math.round((used.ai / limits.ai) * 100)) : 0,
  };

  return {
    plan: ent?.plan ?? "free",
    status: ent?.status ?? "none",
    periodEnd: ent?.period_end ?? null,
    seats: Number(ent?.seats ?? 1),
    featureFlags: (ent?.feature_flags as Record<string, unknown> | null) ?? {},
    used,
    limits,
    pct,
  };
}

export async function requireActiveSubscription() {
  try {
    const ent = await getEntitlements();
    const now = Date.now();
    const periodOk = !ent.periodEnd || new Date(ent.periodEnd).getTime() > now;
    const statusOk = ["active", "trialing", "past_due"].includes(ent.status);
    const allowed = statusOk && periodOk;
    return { allowed, reason: allowed ? "ok" : "no_active_subscription" };
  } catch (error) {
    return { allowed: false, reason: "unauthorized" };
  }
}