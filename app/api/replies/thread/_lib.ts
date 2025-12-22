import type { SupabaseClient } from "@supabase/supabase-js";

type ThreadRow = {
  id: string;
  account_id: string;
  lead_id: string;
  campaign_id: string | null;
  identity_id?: string | null;
  owner_id: string | null;
  status: string;
};

type AccessCheckResult =
  | {
      ok: true;
      thread: ThreadRow;
    }
  | {
      ok: false;
      status: number;
      message: string;
    };

export async function loadThreadForUser(
  supabase: SupabaseClient<any, "public", any>,
  userId: string,
  threadId: string,
): Promise<AccessCheckResult> {
  const { data: thread, error } = await supabase
    .from("reply_threads")
    .select("id, account_id, lead_id, campaign_id, owner_id, status")
    .eq("id", threadId)
    .maybeSingle();

  if (error) {
    console.error("loadThreadForUser failed", error);
    return { ok: false, status: 500, message: "thread_lookup_failed" };
  }

  if (!thread) {
    return { ok: false, status: 404, message: "thread_not_found" };
  }

  if (thread.account_id === userId) {
    return { ok: true, thread: thread as ThreadRow };
  }

  const { data: membership, error: membershipError } = await supabase
    .from("team_members")
    .select("user_id")
    .eq("account_id", thread.account_id)
    .eq("user_id", userId)
    .eq("is_active", true)
    .maybeSingle();

  if (membershipError) {
    console.error("loadThreadForUser membership check failed", membershipError);
    return { ok: false, status: 500, message: "membership_lookup_failed" };
  }

  if (!membership) {
    return { ok: false, status: 403, message: "not_authorized" };
  }

  return { ok: true, thread: thread as ThreadRow };
}

