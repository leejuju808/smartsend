"use client";

import { useCallback, useEffect, useState } from "react";

export type BillingPlanRow = {
  id: string;
  name: string;
  description: string | null;
  daily_send_cap: number;
  daily_reply_cap: number | null;
  seat_limit: number | null;
  is_active: boolean;
};

export type BillingPlansResponse = {
  plans: BillingPlanRow[];
};

export function useBillingPlans() {
  const [data, setData] = useState<BillingPlansResponse | null>(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const res = await fetch("/api/billing/plans");
    const json = await res.json();
    setData(json);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return { data, loading, reload: load };
}





