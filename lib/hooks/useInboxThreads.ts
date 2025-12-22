"use client";

import { useCallback, useEffect, useState } from "react";
import type { InboxFilters } from "./useInboxSearch";

export type InboxThread = {
  thread_key: string;
  lead_id: string | null;
  campaign_id: string | null;
  lead_email?: string | null;
  lead_company?: string | null;
  campaign_name?: string | null;
  last_reply_at: string;
  last_subject?: string | null;
  last_body?: string | null;
  last_ai_category?: string | null;
  last_ai_intent?: string | null;
  has_meeting: boolean;
  reply_count: number;
  thread_status: "open" | "handled";
  meeting_status?: "pending" | "booked" | "completed" | "no_show" | "canceled" | null;
  score_total?: number | null; // NEW: lead score total (0-100)
};

export function useInboxThreads(filters: InboxFilters) {
  const [threads, setThreads] = useState<InboxThread[]>([]);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams();
    if (filters.q) params.set("q", filters.q);
    if (filters.category) params.set("category", filters.category);
    if (filters.campaignId) params.set("campaignId", filters.campaignId);
    if (filters.hasMeeting) params.set("hasMeeting", "true");
    params.set("range", filters.range);
    params.set("limit", "300");

    const res = await fetch(`/api/inbox/threads?${params.toString()}`);
    const json = await res.json();
    setThreads(json.threads || []);
    setLoading(false);
  }, [filters]);

  useEffect(() => {
    load();
  }, [load]);

  return { threads, loading, reload: load };
}

