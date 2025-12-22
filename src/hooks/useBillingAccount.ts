"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase-browser";

export type BillingAccount = {
  id?: string;
  user_id?: string;
  plan: string;
  status: string;
  seats: number;
  period_end: string | null;
};

export function useBillingAccount() {
  const sb = useMemo(supabaseBrowser, []);
  const [account, setAccount] = useState<BillingAccount | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchAccount = useCallback(async () => {
    setLoading(true);
    try {
      const { data: session } = await sb.auth.getUser();
      if (!session?.user) {
        setAccount(null);
        return;
      }

      let { data: acc, error } = await sb
        .from("billing_accounts")
        .select("id, user_id, plan, status, seats, period_end")
        .eq("user_id", session.user.id)
        .maybeSingle();

      if (error) {
        console.error("useBillingAccount load error", error);
      }

      if (!acc) {
        await sb.rpc("ensure_billing_account");
        const res = await sb
          .from("billing_accounts")
          .select("id, user_id, plan, status, seats, period_end")
          .eq("user_id", session.user.id)
          .maybeSingle();
        acc = res.data ?? null;
        if (res.error) {
          console.error("useBillingAccount ensure reload error", res.error);
        }
      }

      if (acc) {
        const normalized: BillingAccount = {
          plan: acc.plan ?? "free",
          status: acc.status ?? "none",
          seats: acc.seats ?? 1,
          period_end: acc.period_end ?? null,
          id: acc.id,
          user_id: acc.user_id,
        };
        setAccount(normalized);
      } else {
        setAccount(null);
      }
    } catch (error) {
      console.error("useBillingAccount fetch error", error);
      setAccount(null);
    } finally {
      setLoading(false);
    }
  }, [sb]);

  useEffect(() => {
    fetchAccount();
  }, [fetchAccount]);

  const isActive = account ? isBillingActive(account) : false;

  return { account, loading, refresh: fetchAccount, isActive };
}

export function isBillingActive(acc: BillingAccount | null) {
  if (!acc) return false;
  const active = acc.status === "active" || acc.status === "trialing";
  if (!active) return false;
  if (!acc.period_end) return true;
  const expires = new Date(acc.period_end).valueOf();
  return Number.isFinite(expires) && expires > Date.now();
}

