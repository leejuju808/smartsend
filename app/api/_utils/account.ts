import type { SupabaseClient } from "@supabase/supabase-js";

type AnyClient = SupabaseClient<any, "public", any>;

export async function setAccountContext(supabase: AnyClient) {
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user?.id) {
    return null;
  }

  const { data: membership } = await supabase
    .from("account_members")
    .select("account_id")
    .eq("user_id", user.id)
    .eq("is_active", true)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (membership?.account_id) {
    await supabase.rpc("set_account", { p_account_id: membership.account_id });
    return membership.account_id;
  }

  return null;
}


