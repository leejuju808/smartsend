"use client";

import { useCallback, useEffect, useState } from "react";
import type { InboxFilterState } from "@/components/inbox/InboxFilters";

export type InboxReplyRow = {
  id: string;
  lead_email?: string | null; // May be flattened from leads.email
  subject: string | null;
  received_at: string;
  ai_category: string | null;
  ai_intent: string | null;
  ai_has_meeting: boolean | null;
  ai_stop_followups: boolean | null;
  status: string | null;
  owner_user_id: string | null;
  meeting_stage: string | null;
  deal_value_cents: number | null;
  is_suppressed?: boolean; // NEW: suppression status
  score_total?: number | null; // NEW: lead score total (0-100)
  // Support nested structure from API
  leads?: { email: string; company: string | null; score_total?: number | null } | null;
};

export type InboxRepliesResponse = {
  replies: InboxReplyRow[];
};

export function useInboxReplies(filters: InboxFilterState) {
  const [data, setData] = useState<InboxRepliesResponse | null>(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    const params = new URLSearchParams();
    if (filters.category && filters.category !== "all") {
      params.set("category", filters.category);
    }
    if (filters.hasMeetingOnly) {
      params.set("has_meeting_only", "true");
    }
    if (filters.stopFollowupsOnly) {
      params.set("stop_followups_only", "true");
    }
    if (filters.search) {
      params.set("search", filters.search);
    }
    if (filters.dateRange) {
      params.set("date_range", filters.dateRange);
    }

    const qs = params.toString();
    const url = qs ? `/api/inbox/replies?${qs}` : "/api/inbox/replies";

    setLoading(true);
    const res = await fetch(url);
    const json = await res.json();
    setData(json);
    setLoading(false);
  }, [
    filters.category,
    filters.hasMeetingOnly,
    filters.stopFollowupsOnly,
    filters.search,
    filters.dateRange,
  ]);

  useEffect(() => {
    load();
  }, [load]);

  return { data, loading, reload: load };
}

