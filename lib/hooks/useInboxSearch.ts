"use client";

import { useCallback, useEffect, useState } from "react";

export type InboxCategoryFilter =
  | ""
  | "interested"
  | "neutral"
  | "not_interested"
  | "out_of_office"
  | "bounce"
  | "forwarded"
  | "not_a_lead"
  | "unlabeled";

export type TimeRange = "24h" | "7d" | "30d";

export type InboxFilters = {
  q: string;
  category: InboxCategoryFilter;
  campaignId: string;
  hasMeeting: boolean;
  range: TimeRange;
};

export function useInboxSearch(initial?: Partial<InboxFilters>) {
  const [filters, setFilters] = useState<InboxFilters>({
    q: "",
    category: "",
    campaignId: "",
    hasMeeting: false,
    range: "7d",
    ...initial,
  });

  const [replies, setReplies] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  const computeRange = useCallback(() => {
    const now = new Date();
    if (filters.range === "24h") {
      return new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();
    }
    if (filters.range === "30d") {
      return new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();
    }
    // default 7d
    return new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
  }, [filters.range]);

  const load = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams();
    if (filters.q) params.set("q", filters.q);
    if (filters.category) params.set("category", filters.category);
    if (filters.campaignId) params.set("campaignId", filters.campaignId);
    if (filters.hasMeeting) params.set("hasMeeting", "true");
    params.set("since", computeRange());
    params.set("limit", "80");

    const res = await fetch(`/api/inbox/replies?${params.toString()}`);
    const json = await res.json();
    setReplies(json.replies || []);
    setLoading(false);
  }, [filters, computeRange]);

  useEffect(() => {
    load();
  }, [load]);

  const updateFilters = (patch: Partial<InboxFilters>) => {
    setFilters((prev) => ({ ...prev, ...patch }));
  };

  return {
    filters,
    setFilters: updateFilters,
    replies,
    loading,
    reload: load,
  };
}






