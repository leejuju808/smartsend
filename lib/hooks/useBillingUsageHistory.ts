"use client";

import { useCallback, useEffect, useState } from "react";

export type UsageHistoryPoint = {
  usage_date: string; // ISO date
  sends_count: number;
  replies_count: number;
};

export type UsageHistoryResponse = {
  days: number;
  points: UsageHistoryPoint[];
};

export function useBillingUsageHistory(days: number = 30) {
  const [data, setData] = useState<UsageHistoryResponse | null>(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const res = await fetch(`/api/billing/usage-history?days=${days}`);
    const json = await res.json();
    setData(json);
    setLoading(false);
  }, [days]);

  useEffect(() => {
    load();
  }, [load]);

  return { data, loading, reload: load };
}





