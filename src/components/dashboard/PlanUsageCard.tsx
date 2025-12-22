"use client";

import { useEffect, useState } from "react";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";

type PlanUsage = {
  planTier: string;
  monthlyLimit: number;
  currentCount: number;
  remaining: number;
};

export function PlanUsageCard({ accountId }: { accountId: string }) {
  const supabase = createClientComponentClient();
  const [usage, setUsage] = useState<PlanUsage | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!accountId) return;

    const fetchUsage = async () => {
      setLoading(true);
      const { data, error } = await supabase.rpc("can_account_send_emails", {
        p_account_id: accountId,
        p_emails_to_send: 0, // just check current usage
      });

      setLoading(false);

      if (error || !data?.[0]) {
        console.error("[PlanUsageCard] Error fetching usage", error);
        return;
      }

      const row = data[0];
      setUsage({
        planTier: row.plan_tier,
        monthlyLimit: row.monthly_limit,
        currentCount: row.current_count,
        remaining: row.remaining,
      });
    };

    fetchUsage();
    
    // Refresh every 30 seconds
    const interval = setInterval(fetchUsage, 30000);
    return () => clearInterval(interval);
  }, [accountId, supabase]);

  if (!usage && !loading) return null;

  const usagePercent = usage
    ? Math.min((usage.currentCount / usage.monthlyLimit) * 100, 100)
    : 0;

  return (
    <div className="rounded-2xl border border-zinc-800 p-4 bg-zinc-900/50">
      <p className="text-xs text-zinc-400 mb-2">Plan Usage</p>
      {loading ? (
        <p className="mt-2 text-sm text-zinc-500">Loading…</p>
      ) : usage ? (
        <>
          <p className="mt-1 text-lg font-semibold capitalize text-white">
            {usage.planTier} Plan
          </p>
          <p className="mt-2 text-sm text-zinc-400">
            {usage.currentCount.toLocaleString()} / {usage.monthlyLimit.toLocaleString()} emails this month
          </p>
          <div className="mt-2 w-full bg-zinc-800 rounded-full h-2">
            <div
              className={`h-2 rounded-full transition-all ${
                usagePercent >= 90
                  ? "bg-red-500"
                  : usagePercent >= 75
                  ? "bg-yellow-500"
                  : "bg-green-500"
              }`}
              style={{ width: `${usagePercent}%` }}
            />
          </div>
          <p className="mt-2 text-xs text-zinc-500">
            {usage.remaining.toLocaleString()} remaining before cap.
          </p>
          {usage.remaining === 0 && (
            <p className="mt-2 text-xs text-yellow-500">
              Limit reached. Upgrade to send more emails.
            </p>
          )}
        </>
      ) : null}
    </div>
  );
}






























































