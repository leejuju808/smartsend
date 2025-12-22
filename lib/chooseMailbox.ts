// lib/chooseMailbox.ts
import { createClient } from "@/utils/supabase/server";

export async function chooseMailbox(accountId: string): Promise<string|null> {
  const sb = createClient();
  const { data } = await sb.from("mailboxes")
    .select("id,send_quota_per_day,send_quota_used,enabled")
    .eq("account_id", accountId)
    .eq("enabled", true)
    .order("send_quota_used", { ascending: true });
  
  const pick = (data || []).find(m => m.send_quota_used < m.send_quota_per_day);
  return pick?.id ?? null;
}















