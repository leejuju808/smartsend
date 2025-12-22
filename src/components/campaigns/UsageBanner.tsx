"use client";

import { useState, useEffect } from "react";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";

interface UsageData {
  emails_sent_today: number;
  usage_soft_cap: number;
  usage_hard_cap: number;
  status: string;
}

export function UsageBanner({ campaignId, onCapChange }: { campaignId: string; onCapChange?: (atCap: boolean) => void }) {
  const [usage, setUsage] = useState<UsageData | null>(null);
  const [loading, setLoading] = useState(true);
  const supabase = createClientComponentClient();

  useEffect(() => {
    loadUsage();
    const interval = setInterval(loadUsage, 60000); // Refresh every minute
    return () => clearInterval(interval);
  }, [campaignId]);

  async function loadUsage() {
    try {
      // Get billing account for campaign
      const { data: accountId } = await supabase.rpc("billing_account_for_campaign", {
        p_campaign: campaignId,
      });

      if (!accountId) {
        setLoading(false);
        return;
      }

      // Get current caps
      const { data: caps } = await supabase.rpc("current_caps", {
        p_account: accountId,
      });

      // Get today's usage
      const { data: usageData } = await supabase
        .from("billing_usage")
        .select("qty")
        .eq("account_id", accountId)
        .eq("day", new Date().toISOString().split("T")[0])
        .eq("metric", "emails_sent")
        .maybeSingle();

      const emailsSentToday = usageData?.qty || 0;
      const softCap = caps?.[0]?.usage_soft_cap || 1000;
      const hardCap = caps?.[0]?.usage_hard_cap || 2000;
      const status = caps?.[0]?.status || "active";

      const usageState = {
        emails_sent_today: emailsSentToday,
        usage_soft_cap: softCap,
        usage_hard_cap: hardCap,
        status,
      };
      
      setUsage(usageState);
      
      // Notify parent if at cap
      if (onCapChange) {
        onCapChange(emailsSentToday >= hardCap);
      }
    } catch (err) {
      console.error("Failed to load usage:", err);
    } finally {
      setLoading(false);
    }
  }

  if (loading || !usage) return null;

  const usagePercent = (usage.emails_sent_today / usage.usage_soft_cap) * 100;
  const isAtCap = usage.emails_sent_today >= usage.usage_hard_cap;
  const isNearCap = usagePercent >= 80;

  if (!isNearCap && !isAtCap) return null;

  return (
    <div
      className={`w-full rounded-lg border p-4 ${
        isAtCap
          ? "border-red-500 bg-red-50"
          : isNearCap
          ? "border-yellow-500 bg-yellow-50"
          : "border-gray-200 bg-gray-50"
      }`}
    >
      <div className="flex items-center justify-between">
        <div className="flex-1">
          <div className="font-medium mb-1">
            {isAtCap
              ? "Daily plan limit reached"
              : `You're at ${Math.round(usagePercent)}% of today's plan limit`}
          </div>
          <div className="text-sm text-muted-foreground">
            {usage.emails_sent_today} / {usage.usage_soft_cap} emails today
            {!isAtCap && " (hard limit: " + usage.usage_hard_cap + ")"}
          </div>
          <div className="mt-2 w-full h-2 bg-muted rounded overflow-hidden">
            <div
              className={`h-full rounded ${
                isAtCap ? "bg-red-500" : "bg-yellow-500"
              }`}
              style={{ width: `${Math.min(100, usagePercent)}%` }}
            />
          </div>
        </div>
        <div className="ml-4">
          <a
            href="/billing"
            className="text-sm font-medium underline hover:no-underline"
          >
            Upgrade
          </a>
        </div>
      </div>
    </div>
  );
}
