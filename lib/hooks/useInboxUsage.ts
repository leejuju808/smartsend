"use client";

import { useCallback, useEffect, useState } from "react";

export type InboxUsageRow = {
  inbox_id: string;
  email: string | null;
  provider: string | null;
  status: string | null;
  daily_send_cap: number;
  sends_today: number;
  sends_30d: number;
  daily_send_pct: number;
};

type InboxUsageResponse = {
  workspace_id: string;
  inboxes: InboxUsageRow[];
  generated_at: string;
};

export function useInboxUsage() {
  const [data, setData] = useState<InboxUsageResponse | null>(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/billing/inboxes");
      const json = await res.json();
      if (res.ok && Array.isArray(json.inboxes)) {
        setData(json as InboxUsageResponse);
      } else {
        setData(null);
      }
    } catch (err) {
      console.error("useInboxUsage error", err);
      setData(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return { data, loading, reload: load };
}





