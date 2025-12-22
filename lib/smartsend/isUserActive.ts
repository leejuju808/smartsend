import { createClient } from "@/lib/supabase/server";

export async function isUserActive() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { active: false, user: null };

  const { data: sub } = await supabase
    .from("billing_subscriptions")
    .select("*")
    .eq("user_id", user.id)
    .in("status", ["trialing", "active", "past_due"])
    .order("current_period_end", { ascending: false })
    .limit(1)
    .maybeSingle();

  return { active: !!sub, user };
}


































































