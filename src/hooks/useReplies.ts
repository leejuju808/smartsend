"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createClientComponentClient } from "@/lib/supabase";
import type { ReplyFilters } from "@/components/replies/FiltersBar";

export type ReplyRow = {
  id: string;
  subject: string | null;
  body: string | null;
  is_reply: boolean;
  is_read: boolean;
  created_at: string;
  lead_id: string | null;
  campaign_id: string | null;
  leads?: { id: string; name: string | null; email: string | null };
};

export function useReplies(filters: ReplyFilters, pageSize = 25) {
  const supabase = createClientComponentClient();
  const [page, setPage] = useState(0);
  const [rows, setRows] = useState<ReplyRow[]>([]);
  const [total, setTotal] = useState<number>(0);
  const [loading, setLoading] = useState(false);

  const range = useMemo(() => {
    const from = page * pageSize;
    const to = from + pageSize - 1;
    return { from, to };
  }, [page, pageSize]);

  const fetchList = useCallback(async () => {
    setLoading(true);
    
    // If search query is provided, use RPC for full-text search
    if (filters.q && filters.q.trim().length > 1) {
      const { data, error } = await supabase.rpc("search_replies", {
        q: filters.q,
        campaign: filters.campaignId ?? null,
        only_unread: !!filters.onlyUnread,
        human_only: filters.isReply === "human",
        auto_only: filters.isReply === "auto",
        from_idx: range.from,
        to_idx: range.to
      });
      
      if (error) console.error(error);
      setRows((data as any as ReplyRow[]) ?? []);
      setTotal((data && data.length > 0 ? data[0].count : 0) as number ?? 0);
      setLoading(false);
      return;
    }

    // Otherwise, use standard query
    let q = supabase
      .from("replies")
      .select("id, subject, body, is_reply, is_read, created_at, lead_id, campaign_id, leads(id, name, email)", { count: "exact" })
      .order("created_at", { ascending: false })
      .range(range.from, range.to);

    if (filters.campaignId) q = q.eq("campaign_id", filters.campaignId);
    if (filters.onlyUnread) q = q.eq("is_read", false);
    if (filters.isReply === "human") q = q.eq("is_reply", true);
    if (filters.isReply === "auto") q = q.eq("is_reply", false);

    const { data, count, error } = await q;
    if (error) console.error(error);
    setRows((data as ReplyRow[]) ?? []);
    setTotal(count ?? 0);
    setLoading(false);
  }, [supabase, filters, range]);

  useEffect(() => { setPage(0); }, [filters.campaignId, filters.onlyUnread, filters.isReply, filters.q]);

  useEffect(() => { fetchList(); }, [fetchList]);

  // Realtime channel scoped to table; we re-fetch on insert/update that could affect filters
  useEffect(() => {
    const ch = supabase
      .channel("replies-rt")
      .on("postgres_changes", { event: "*", schema: "public", table: "replies" }, () => fetchList())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [supabase, fetchList]);

  return { rows, total, page, setPage, pageSize, loading, refetch: fetchList };
}
