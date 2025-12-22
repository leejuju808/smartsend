import type { PostgrestSingleResponse } from "@supabase/supabase-js";
import { createClient } from "@/utils/supabase/server";

export type SupabaseServerClient = ReturnType<typeof createClient>;

export type AccountContextResult =
  | { ok: true; userId: string; accountId: string; role: string | null }
  | { ok: false; status: number; message: string };

export async function resolveAccountContext(supabase: SupabaseServerClient): Promise<AccountContextResult> {
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError) {
    return { ok: false, status: 500, message: authError.message };
  }

  if (!user) {
    return { ok: false, status: 401, message: "Unauthorized" };
  }

  const membership = (await supabase
    .from("account_members")
    .select("account_id, role")
    .eq("user_id", user.id)
    .or("is_active.is.null,is_active.eq.true")
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle()) as PostgrestSingleResponse<{ account_id: string | null; role: string | null }>;

  if (membership.error) {
    return { ok: false, status: 400, message: membership.error.message };
  }

  const accountId = membership.data?.account_id ?? null;
  if (!accountId) {
    return { ok: false, status: 404, message: "No active account" };
  }

  await supabase.rpc("set_account", { p_account_id: accountId });

  return {
    ok: true,
    userId: user.id,
    accountId,
    role: membership.data?.role ?? null,
  };
}

