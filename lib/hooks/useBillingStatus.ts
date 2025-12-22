"use client";

import { useCallback, useEffect, useState } from "react";

export type BillingStatus = {
  workspace_id: string;
  plan_id: string | null;
  plan_name: string | null;
  subscription_status: string | null;
  trial_ends_at: string | null;
  can_send: boolean;
  reason_code: string | null;
};

export function useBillingStatus() {
  const [data, setData] = useState<BillingStatus | null>(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const res = await fetch("/api/billing/status");
    const json = await res.json();
    setData(json);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return { data, loading, reload: load };
}





