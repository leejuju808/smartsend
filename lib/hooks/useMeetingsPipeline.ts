"use client";

import { useCallback, useEffect, useState } from "react";

export type MeetingStatus =
  | "pending"
  | "booked"
  | "completed"
  | "no_show"
  | "canceled";

export type MeetingPipelineRow = {
  workspace_id: string;
  lead_id: string;
  campaign_id: string;
  status: MeetingStatus;
  meeting_at: string | null;
  notes: string | null;
  leads?: {
    email: string | null;
    company: string | null;
    first_name?: string | null;
    last_name?: string | null;
  } | null;
  campaigns?: {
    name: string | null;
  } | null;
};

export type MeetingsPipelineFilters = {
  status: "" | MeetingStatus;
  range: "upcoming" | "past7" | "past30" | "all";
  campaignId: string;
  q: string;
};

export function useMeetingsPipeline(initial?: Partial<MeetingsPipelineFilters>) {
  const [filters, setFilters] = useState<MeetingsPipelineFilters>({
    status: "",
    range: "upcoming",
    campaignId: "",
    q: "",
    ...initial,
  });

  const [rows, setRows] = useState<MeetingPipelineRow[]>([]);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams();
    if (filters.status) params.set("status", filters.status);
    if (filters.range) params.set("range", filters.range);
    if (filters.campaignId) params.set("campaignId", filters.campaignId);
    if (filters.q) params.set("q", filters.q);

    const res = await fetch(`/api/meetings/pipeline?${params.toString()}`);
    const json = await res.json();
    setRows(json.meetings || []);
    setLoading(false);
  }, [filters]);

  useEffect(() => {
    load();
  }, [load]);

  return {
    filters,
    setFilters,
    rows,
    loading,
    reload: load,
  };
}






