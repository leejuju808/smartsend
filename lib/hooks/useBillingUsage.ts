"use client";

import { useCallback, useEffect, useState } from "react";

export type BillingUsageResponse = {
  workspace_id: string;
  plan_tier: "free" | "starter" | "pro";
  plan_label: string;
  caps: {
    seat_limit: number;
    daily_send_cap: number;
    monthly_send_cap: number;
    monthly_reply_cap: number;
  };
  usage: {
    seats_used: number;
    sends_today: number;
    sends_30d: number;
    replies_30d: number;
    seat_pct: number;
    daily_send_pct: number;
    monthly_send_pct: number;
    monthly_reply_pct: number;
  };
  warnings: string[];
  generated_at: string;
};

export function useBillingUsage() {
  const [data, setData] = useState<BillingUsageResponse | null>(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/billing/usage");
      const json = await res.json();
      if (res.ok) {
        setData(json as BillingUsageResponse);
      } else {
        setData(null);
      }
    } catch (err) {
      console.error("useBillingUsage error", err);
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





