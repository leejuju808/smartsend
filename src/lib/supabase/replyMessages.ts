import { supabase } from "@/lib/supabaseClient";

export async function getCachedThread(userId: string, threadId: string) {
  const { data, error } = await supabase
    .from("reply_messages")
    .select("*")
    .eq("user_id", userId)
    .eq("gmail_thread_id", threadId)
    .order("internal_ts", { ascending: true });
  if (error) throw error;
  return data ?? [];
}












