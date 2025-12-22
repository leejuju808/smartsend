import { createClient } from "@/lib/supabase/server";

export type InboxFilter =
  | "all"
  | "replied"
  | "out_of_office"
  | "paused"
  | "not_interested"
  | "scheduling"
  | "question"
  | "neutral"
  | "unclear"
  | "mine"
  | "unassigned"
  | "needs_attention"
  | "open";

export async function listThreadsWithStatus(opts: {
  filter?: InboxFilter;
  limit?: number;
  offset?: number;
}) {
  const supabase = createClient();
  const filter = opts.filter ?? "all";

  // Get current user for "mine" filter
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const currentUserId = user?.id ?? null;

  let q = supabase
    .from("v_threads_with_status")
    .select("*")
    .order("updated_at", { ascending: false });

  // Handle collaboration filters
  if (filter === "mine" && currentUserId) {
    // Join with reply_threads to filter by assigned_to
    q = q.eq("assigned_to", currentUserId);
  } else if (filter === "unassigned") {
    q = q.is("assigned_to", null);
  } else if (filter === "open") {
    // Join with reply_threads to filter by status
    q = q.eq("status", "open");
  } else if (filter === "needs_attention") {
    // Filter by ai_opportunity_score >= 6
    q = q.gte("ai_opportunity_score", 6);
  } else if (filter === "paused") {
    q = q.eq("auto_paused", true);
  } else if (filter !== "all") {
    q = q.eq("latest_intent", filter);
  }

  if (opts.limit) q = q.limit(opts.limit);
  if (opts.offset)
    q = q.range(
      opts.offset,
      (opts.offset || 0) + (opts.limit || 50) - 1,
    );

  const { data, error } = await q;
  if (error) throw error;
  return data;
}





