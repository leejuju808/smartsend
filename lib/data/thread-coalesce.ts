type SupabaseClient = {
  from: (table: string) => any;
  rpc: (fn: string, args?: Record<string, unknown>) => Promise<{ data: unknown; error: any }>;
};

export async function coalesceThreadByKey(supabase: SupabaseClient, threadId: string) {
  if (!threadId) return;

  const { data: latest, error: latestError } = await supabase
    .from("inbox_messages")
    .select("thread_key, thread_id")
    .eq("thread_id", threadId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (latestError || !latest?.thread_key) {
    return;
  }

  const { data: other, error: otherError } = await supabase
    .from("inbox_messages")
    .select("thread_id")
    .eq("thread_key", latest.thread_key)
    .neq("thread_id", threadId)
    .limit(1);

  if (otherError || !other || other.length === 0) {
    return;
  }

  await supabase.rpc("merge_threads", {
    p_src: other[0].thread_id,
    p_dst: threadId,
  });
}






