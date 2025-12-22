// Database utility functions for inbox
import { SupabaseClient } from "@supabase/supabase-js";

export async function getInboxItems(
  client: SupabaseClient,
  {
    userId,
    filter,
  }: { userId: string; filter?: "all" | "replied" | "unreplied" }
) {
  let q = client
    .from("emails_sent")
    .select(`id, lead_id, subject, thread_id, sent_at, replied`)
    .eq("user_id", userId)
    .order("sent_at", { ascending: false });

  if (filter === "replied") q = q.eq("replied", true);
  if (filter === "unreplied") q = q.eq("replied", false);

  return q;
}

