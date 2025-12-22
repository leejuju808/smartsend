import { createClient } from "@/src/lib/supabase/server";

export async function getAiSdrThreads({
  status,
  search,
  health,
  inbox,
}: {
  status?: string;
  search?: string;
  health?: string;
  inbox?: string;
}) {
  const supabase = createClient();

  let query = supabase
    .from("ai_sdr_thread_overview")
    .select("*")
    .order("health_score", { ascending: false, nullsFirst: false }) // show hottest first
    .order("last_message_at", { ascending: false });

  if (status && status !== "all") {
    query = query.eq("status", status);
  }

  if (health && health !== "all") {
    query = query.eq("health_label", health);
  }

  if (inbox && inbox !== "all") {
    query = query.eq("inbox_state", inbox);
  }
  // If inbox is "all" or not specified, show all threads (no filter)

  if (search && search.trim().length > 0) {
    query = query.or(
      `lead_email.ilike.%${search}%,lead_name.ilike.%${search}%`
    );
  }

  const { data, error } = await query;
  if (error) throw error;
  return data;
}

export async function getAiSdrThreadDetail(threadId: string) {
  const supabase = createClient();

  const [{ data: thread }, { data: timeline }] = await Promise.all([
    supabase
      .from("ai_sdr_thread_overview")
      .select("*")
      .eq("thread_id", threadId)
      .single(),
    supabase
      .from("ai_sdr_timeline_items")
      .select("*")
      .eq("thread_id", threadId)
      .order("created_at", { ascending: true }),
  ]);

  if (!thread) {
    return { thread: null, timeline: timeline || [] };
  }

  return { thread, timeline: timeline || [] };
}

export async function draftReply(threadId: string) {
  const res = await fetch("/api/ai-sdr/draft-reply", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      thread_id: threadId
    })
  });

  if (!res.ok) {
    const error = await res.json().catch(() => ({ error: "Failed to generate draft" }));
    throw new Error(error.error || "Failed to generate draft");
  }
  return res.json();
}

export async function executeNextBestAction(
  threadId: string,
  action: string,
  optionLabel?: string
) {
  const res = await fetch("/api/ai-sdr/execute-action", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      thread_id: threadId,
      action,
      option_label: optionLabel,
    }),
  });

  if (!res.ok) {
    const error = await res.json().catch(() => ({ error: "Failed to execute action" }));
    throw new Error(error.error || "Failed to execute action");
  }

  return res.json();
}

