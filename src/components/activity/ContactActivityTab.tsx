"use client";

import React, { useState, useEffect } from "react";
import { ActivityLogTable } from "./ActivityLogTable";
import { ActivityLog } from "@/app/activity/page";

export function ContactActivityTab({ contactId }: { contactId: string }) {
  const [logs, setLogs] = useState<ActivityLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [cursor, setCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);

  const fetchLogs = async (reset = false) => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (!reset && cursor) params.set("cursor", cursor);
      params.set("limit", "50");

      const res = await fetch(`/api/activity/contact/${contactId}?${params.toString()}`);
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
      console.error("Failed to fetch contact activity logs:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLogs(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contactId]);

  const handleLoadMore = () => {
    if (!loading && hasMore) {
      fetchLogs(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Activity Log</h2>
        <p className="text-sm text-gray-600">
          Complete history of all events for this contact
        </p>
      </div>

      <ActivityLogTable
        logs={logs}
        loading={loading}
        hasMore={hasMore}
        onLoadMore={handleLoadMore}
      />
    </div>
  );
}





















































