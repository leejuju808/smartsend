"use client";

import { supabaseBrowser } from "./client";
import { ThreadRow, EmailMessage } from "./inbox-types";

const PAGE_SIZE = 30;

export async function fetchThreads(opts: { search?: string; page?: number }): Promise<{
  data: ThreadRow[];
  total: number;
}> {
  const supabase = supabaseBrowser();
  const from = ((opts.page ?? 1) - 1) * PAGE_SIZE;
  const to = from + PAGE_SIZE - 1;

  let query = supabase
    .from("inbox_threads")
    .select("*")
    .order("last_at", { ascending: false })
    .range(from, to);

  if (opts.search && opts.search.trim()) {
    // simple client-side filter: you can replace with a tsvector in SQL if needed
    const { data, error } = await query;
    if (error) throw error;
    const s = opts.search.toLowerCase();
    const filtered = (data ?? []).filter((t) =>
      [t.lead_email, t.first_name, t.last_name, t.company, t.last_snippet]
        .filter(Boolean)
        .some((x) => (x as string).toLowerCase().includes(s))
    );

    return { data: filtered as ThreadRow[], total: filtered.length };
  }

  const { data, error, count } = await query;
  if (error) throw error;
  return { data: (data ?? []) as ThreadRow[], total: count ?? (data?.length ?? 0) };
}

export async function fetchMessages(threadId: string): Promise<EmailMessage[]> {
  const supabase = supabaseBrowser();
  const { data, error } = await supabase
    .from("email_messages")
    .select("*")
    .eq("thread_id", threadId)
    .order("sent_at", { ascending: true });

  if (error) throw error;
  return (data ?? []) as EmailMessage[];
}

export async function markThreadRead(threadId: string): Promise<void> {
  const res = await fetch("/api/replies/mark-read", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ threadId }),
  });
  if (!res.ok) throw new Error("Failed to mark read");
}

export async function sendReply(input: {
  threadId: string;
  leadId: string;
  subject?: string;
  bodyText: string;
}): Promise<{ id: string }> {
  const res = await fetch("/api/replies/send-inbox", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(t || "Failed to send reply");
  }
  return (await res.json()) as { id: string };
}

export async function getReplies() {
  const supabase = supabaseBrowser();
  const { data, error } = await supabase
    .from('email_replies')
    .select('*')
    .order('received_at', { ascending: false });

  if (error) throw error;
  return data;
}

