"use client";

import React, { useState, useEffect } from "react";
import { ActivityLogTable } from "@/components/activity/ActivityLogTable";
import { ActivityFilters } from "@/components/activity/ActivityFilters";

export type ActivityLog = {
  id: string;
  workspace_id: string;
  user_id?: string | null;
  category?: string | null;
  type: string;
  event_type?: string | null;
  event_data?: Record<string, any>;
  contact_id?: string | null;
  campaign_id?: string | null;
  lead_id?: string | null;
  revenue_value?: number | null;
  metadata?: Record<string, any>;
  created_at: string;
  user?: {
    id: string;
    email: string;
    name?: string;
  } | null;
  contact?: {
    id: string;
    email: string;
    first_name?: string;
    last_name?: string;
  } | null;
  campaign?: {
    id: string;
    name: string;
  } | null;
};

export type ActivityFilters = {
  category?: string;
  event_type?: string;
  contact_id?: string;
  campaign_id?: string;
  user_id?: string;
  date_from?: string;
  date_to?: string;
};

export default function ActivityPage() {
  const [filters, setFilters] = useState<ActivityFilters>({});
  const [logs, setLogs] = useState<ActivityLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [cursor, setCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);

  const fetchLogs = async (reset = false) => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (filters.category) params.set("category", filters.category);
      if (filters.event_type) params.set("event_type", filters.event_type);
      if (filters.contact_id) params.set("contact_id", filters.contact_id);
      if (filters.campaign_id) params.set("campaign_id", filters.campaign_id);
      if (filters.user_id) params.set("user_id", filters.user_id);
      if (filters.date_from) params.set("date_from", filters.date_from);
      if (filters.date_to) params.set("date_to", filters.date_to);
      if (!reset && cursor) params.set("cursor", cursor);
      params.set("limit", "100");

      const res = await fetch(`/api/activity?${params.toString()}`);
      const json = await res.json();

      if (res.ok) {
        if (reset) {
          setLogs(json.data);
        } else {
          setLogs((prev) => [...prev, ...json.data]);
        }
        setCursor(json.pagination.cursor);
        setHasMore(json.pagination.hasMore);
      }
    } catch (error) {
      console.error("Failed to fetch activity logs:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLogs(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters]);

  const handleLoadMore = () => {
    if (!loading && hasMore) {
      fetchLogs(false);
    }
  };

  return (
    <div className="max-w-7xl mx-auto space-y-6 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Activity Logs</h1>
          <p className="text-sm text-gray-600 mt-1">
            Complete audit trail of all SmartSend activity
          </p>
        </div>
      </div>

      <ActivityFilters filters={filters} onFiltersChange={setFilters} />

      <ActivityLogTable
        logs={logs}
        loading={loading}
        hasMore={hasMore}
        onLoadMore={handleLoadMore}
      />
    </div>
  );
}





















































