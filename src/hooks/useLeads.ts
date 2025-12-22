"use client";
import { useEffect, useState } from "react";
import { onLeadsRefresh } from "@/lib/leadsBus";

export type Lead = {
  id: string;
  email: string;
  first_name: string | null;
  last_name: string | null;
  company: string | null;
  status: "queued" | "sending" | "sent" | "failed" | "replied";
  campaign_id: string;
  attempt: number;
  max_attempts: number;
  last_error: string | null;
  created_at: string;
};

type Params = { status?: string; campaignId?: string; from?: string; to?: string; page?: number; pageSize?: number; };

export function useLeads(params: Params) {
  const [items, setItems] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(params.page ?? 1);
  const [pageSize, setPageSize] = useState(params.pageSize ?? 25);
  const [totalPages, setTotalPages] = useState(1);

  async function load(p = page, ps = pageSize) {
    setLoading(true);
    setError(null);
    const qs = new URLSearchParams(
      Object.fromEntries(
        Object.entries({ ...params, page: String(p), pageSize: String(ps) })
          .filter(([, v]) => v != null && v !== "")
          .map(([k, v]) => [k, String(v)])
      )
    ).toString();

    const res = await fetch(`/api/leads/list?${qs}`, { cache: "no-store" });
    const json = await res.json();
    if (!res.ok) {
      setError(json?.error ?? "Failed to load");
      setItems([]);
      setTotal(0);
      setTotalPages(1);
    } else {
      setItems(json.items || []);
      setTotal(json.total || 0);
      setPage(json.page || 1);
      setPageSize(json.pageSize || ps);
      setTotalPages(json.totalPages || 1);
    }
    setLoading(false);
  }

  useEffect(() => {
    load(1, pageSize);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.status, params.campaignId, params.from, params.to, params.pageSize]);

  useEffect(() => {
    const off = onLeadsRefresh(() => load());
    return () => off();
  }, [page, pageSize, params.status, params.campaignId, params.from, params.to]);

  return {
    items, loading, error,
    total, page, pageSize, totalPages,
    setPage: (p: number) => load(p, pageSize),
    setPageSize: (ps: number) => load(1, ps),
    reload: () => load(),
  };
}


