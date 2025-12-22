"use client";

import { useCallback, useEffect, useState } from "react";
import type { ReplyInboxFilters, ReplyInboxResponse, ReplyThreadSummary } from "@/types/reply-inbox";

export function useReplyInbox(filters: ReplyInboxFilters = {}) {
  const [data, setData] = useState<ReplyInboxResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const load = useCallback(async () => {
    const params = new URLSearchParams();

    // Intent filter
    if (filters.intent && filters.intent !== "all") {
      const intentList = Array.isArray(filters.intent)
        ? filters.intent.join(",")
        : filters.intent;
      params.set("intent", intentList);
    }

    // Status filter (thread status)
    if (filters.status && filters.status !== "all") {
      params.set("status", filters.status);
    }

    // Campaign filters (Block 11400)
    if (filters.campaignIds && filters.campaignIds.length > 0) {
      params.set("campaignIds", filters.campaignIds.join(","));
    } else if (filters.campaignId) {
      // Backward compatibility: single campaign
      params.set("campaignId", filters.campaignId);
    }

    // Tags filter (Block 11400)
    if (filters.tags && filters.tags.length > 0) {
      params.set("tags", filters.tags.join(","));
    }

    // Lead status filter (Block 11400)
    if (filters.leadStatus && filters.leadStatus !== "all") {
      params.set("leadStatus", filters.leadStatus);
    }

    // Search
    if (filters.q) {
      params.set("q", filters.q);
    }

    // Assignee filter (prefer assignee over scope for backward compatibility)
    if (filters.assignee) {
      params.set("assignee", filters.assignee);
    } else if (filters.scope) {
      // Backward compatibility: map scope to assignee
      params.set("assignee", filters.scope === "mine" ? "me" : "all");
    }

    // Activity filter (Block 11400)
    if (filters.activity) {
      params.set("activity", filters.activity);
      if (filters.activity === "no_reply_x" && filters.daysWithoutReply) {
        params.set("daysWithoutReply", filters.daysWithoutReply.toString());
      }
    } else if (filters.dateRange && filters.dateRange !== "all") {
      // Backward compatibility: map dateRange to activity
      const dateRangeMap: Record<string, string> = {
        today: "24h",
        "7days": "7d",
        "30days": "30d",
      };
      if (dateRangeMap[filters.dateRange]) {
        params.set("activity", dateRangeMap[filters.dateRange]);
      }
    }

    const qs = params.toString();
    const url = qs ? `/api/inbox/replies?${qs}` : "/api/inbox/replies";

    setLoading(true);
    setError(null);

    try {
      const res = await fetch(url);
      if (!res.ok) {
        throw new Error(`Failed to load replies: ${res.statusText}`);
      }
      const json = await res.json();
      setData(json);
    } catch (err) {
      setError(err instanceof Error ? err : new Error("Unknown error"));
      console.error("Error loading reply inbox:", err);
    } finally {
      setLoading(false);
    }
  }, [
    filters.intent,
    filters.status,
    filters.campaignId,
    filters.campaignIds,
    filters.tags,
    filters.leadStatus,
    filters.q,
    filters.scope,
    filters.assignee,
    filters.activity,
    filters.daysWithoutReply,
    filters.dateRange,
  ]);

  useEffect(() => {
    load();
  }, [load]);

  return { data, loading, error, reload: load };
}

