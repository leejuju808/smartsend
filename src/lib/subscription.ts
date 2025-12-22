import { createClient } from "@supabase/supabase-js";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

export type EffectiveBilling = {
  is_paid: boolean;
  monthly_send_cap: number;
  subscription_status: string | null;
  plan_nickname: string | null;
};

export type EffectiveSubscription = {
  status: string | null;
  renews_at: string | null;
  is_active: boolean;
};

export type GateResult = {
  ok: boolean;
  redirect?: string;
};

/**
 * Get the effective subscription for the current user
 * Uses v_billing_effective view or profiles table
 */
export async function getEffectiveSubscription(user_id: string): Promise<EffectiveSubscription> {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
  
  // Try to get from v_billing_effective view first
  const { data: viewData } = await supabase
    .from("v_billing_effective")
    .select("subscription_status, current_period_end")
    .eq("id", user_id)
    .maybeSingle();

  if (viewData) {
    const status = viewData.subscription_status;
    const renews_at = viewData.current_period_end;
    return {
      status,
      renews_at,
      is_active: isActive(status, renews_at),
    };
  }

  // Fallback to profiles table directly
  const { data: profileData } = await supabase
    .from("profiles")
    .select("subscription_status, current_period_end")
    .eq("id", user_id)
    .maybeSingle();

  const status = profileData?.subscription_status ?? null;
  const renews_at = profileData?.current_period_end ?? null;
  
  return {
    status,
    renews_at,
    is_active: isActive(status, renews_at),
  };
}

/**
 * Check if a subscription status is active
 */
export function isActive(status: string | null, renews_at: string | null): boolean {
  if (!status) return false;
  
  // Check if status indicates active subscription
  const activeStatuses = ['active', 'trialing'];
  if (!activeStatuses.includes(status)) {
    return false;
  }

  // Check if subscription hasn't expired
  if (renews_at) {
    const renewDate = new Date(renews_at);
    const now = new Date();
    if (renewDate < now) {
      return false;
    }
  }

  return true;
}

/**
 * Require Pro subscription or redirect
 */
export async function requireProOrRedirect(): Promise<GateResult> {
  const cookieStore = await cookies();
  const supabase = createServerClient(
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
    }
  );

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return { ok: false, redirect: "/login" };
  }

  const billing = await getEffectiveBilling(user.id);
  
  if (!billing.is_paid) {
    return { ok: false, redirect: "/dashboard/billing" };
  }

  return { ok: true };
}

/**
 * Get effective billing information for a user
 * Used to gate features and enforce caps
 */
export async function getEffectiveBilling(user_id: string): Promise<EffectiveBilling> {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
  
  const { data, error } = await supabase
    .from("v_billing_effective")
    .select("subscription_status, plan_nickname, is_paid, monthly_send_cap")
    .eq("id", user_id)
    .maybeSingle();

  if (error) {
    console.error("Error fetching billing info:", error);
  }

  return {
    is_paid: !!data?.is_paid,
    monthly_send_cap: data?.monthly_send_cap ?? 200,
    subscription_status: data?.subscription_status ?? null,
    plan_nickname: data?.plan_nickname ?? null,
  };
}

/**
 * Check if a user has an active paid subscription
 */
export async function isPaidUser(user_id: string): Promise<boolean> {
  const billing = await getEffectiveBilling(user_id);
  return billing.is_paid;
}

/**
 * Get the user's current send cap based on their subscription
 */
export async function getUserSendCap(user_id: string): Promise<number> {
  const billing = await getEffectiveBilling(user_id);
  return billing.monthly_send_cap;
}
