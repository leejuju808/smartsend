"use client";

import { useEffect, useMemo, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase-browser";

export type BillingUsage = {
  billing_id: string;
  owner_id: string;
  plan: "free" | "starter" | "pro" | "team";
  status: "none" | "trialing" | "active" | "past_due" | "canceled" | "incomplete";
  seats_max: number;
  campaigns_max: number;
  seats_used: number;
  campaigns_used: number;
};

export function useBilling() {
  const sb = useMemo(supabaseBrowser, []);
  const [data, setData] = useState<BillingUsage | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      const { data, error } = await sb.rpc("get_my_billing_usage");
      if (!cancelled) {
        if (!error && data) {
          setData(data as BillingUsage);
        }
        setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [sb]);

  return { data, loading };
}










