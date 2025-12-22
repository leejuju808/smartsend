import { createClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { PLAN_LIMITS, type Entitlements } from "./entitlements";

export async function getUserPlan(): Promise<Entitlements & { userId: string | null }> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
  const supabase = createClient(supabaseUrl, anonKey, { cookies: { get: (n) => cookies().get(n)?.value } });

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ...PLAN_LIMITS.starter, userId: null };

  const { data } = await supabase
    .from("billing_subscriptions")
    .select("plan,status")
    .eq("user_id", user.id)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const planKey = (data?.plan as keyof typeof PLAN_LIMITS) ?? "starter";
  return { ...PLAN_LIMITS[planKey], userId: user.id };
}


