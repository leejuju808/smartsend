"use client";

import { useCallback, useEffect, useState } from "react";

export type BillingPlan = {
  id: string;
  name: string;
  description: string | null;
  daily_send_cap: number;
  daily_reply_cap: number | null;
  seat_limit: number | null;
};

export type WorkspaceBillingState = {
  workspace_id: string;
  plan_id: string;
  override_daily_send_cap: number | null;
  override_daily_reply_cap: number | null;
  override_seat_limit: number | null;
  subscription_status: string | null;
  trial_ends_at: string | null;
  cancel_at: string | null;
  current_period_end: string | null;
};

export function useBillingPlan() {
  const [plan, setPlan] = useState<BillingPlan | null>(null);
  const [state, setState] = useState<WorkspaceBillingState | null>(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const res = await fetch("/api/billing/plan");
    const json = await res.json();
    setPlan(json.plan || null);
    setState(json.state || null);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return { plan, state, loading, reload: load };
}

