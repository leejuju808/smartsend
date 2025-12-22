"use client";

import { useCallback, useEffect, useState } from "react";

export type BillingUsageSummary = {
  sends_today: number;
  daily_send_cap: number;
  send_cap_status: "ok" | "near" | "reached";
  overage_behavior: "hard_stop" | "soft_warn";
  replies_today: number;
  daily_reply_cap: number | null;
  seats_used: number;
  seat_limit: number | null;
};

export type BillingUsageResponse = {
  usage: BillingUsageSummary;
  last_send_cap_event: {
    event_type: string;
    payload: any;
    created_at: string;
  } | null;
  last_reply_cap_event: {
    event_type: string;
    payload: any;
    created_at: string;
  } | null;
};

export function useBillingUsageSummary() {
  const [data, setData] = useState<BillingUsageResponse | null>(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const res = await fetch("/api/billing/usage-summary");
    const json = await res.json();
    setData(json);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return { data, loading, reload: load };
}

