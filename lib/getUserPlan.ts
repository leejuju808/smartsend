import { getServerSupabase } from "@/lib/supabase/server";

export async function getUserPlan() {
  const supabase = getServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { user: null, plan: null, status: null };

  const { data, error } = await supabase
    .from("subscriptions")
    .select("plan,status,current_period_end")
    .eq("user_id", user.id)
    .order("current_period_end", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) return { user, plan: null, status: null };
  return { user, plan: data?.plan ?? null, status: data?.status ?? null };
}