"use client";

import { useEffect, useState } from "react";

type EntUsage = {
  plan: string;
  status: string;
  used: { sends: number; ai: number };
  limits: { sends: number; ai: number; maxCampaigns: number; maxSeats: number };
  pct: { sends: number; ai: number };
};

export function UsageBar() {
  const [data, setData] = useState<EntUsage | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/entitlements", { credentials: "include" });
        if (!res.ok) return;
        const body = (await res.json()) as EntUsage;
        setData(body);
      } catch (error) {
        console.error("usage fetch failed", error);
      }
    })();
  }, []);

  if (!data) return null;

  const warn =
    data.pct.sends >= 90 ||
    data.pct.ai >= 90 ||
    !["active", "trialing"].includes(data.status);

  return (
    <div className={`rounded-xl border p-3 ${warn ? "border-amber-500" : "border-muted"}`}>
      <div className="flex items-center justify-between mb-2 text-xs">
        <div className="font-medium uppercase tracking-wide">Plan: {data.plan}</div>
        <a href="/billing" className="border rounded px-2 py-1 hover:bg-muted">
          Manage Billing
        </a>
      </div>
      <div className="space-y-2 text-xs">
        <div className="flex justify-between">
          <span>Sends</span>
          <span>
            {data.used.sends} / {data.limits.sends}
          </span>
        </div>
        <div className="h-2 w-full rounded bg-muted overflow-hidden">
          <div className="h-full bg-primary transition-all" style={{ width: `${data.pct.sends}%` }} />
        </div>

        <div className="flex justify-between">
          <span>AI Actions</span>
          <span>
            {data.used.ai} / {data.limits.ai}
          </span>
        </div>
        <div className="h-2 w-full rounded bg-muted overflow-hidden">
          <div className="h-full bg-primary transition-all" style={{ width: `${data.pct.ai}%` }} />
        </div>

        {!["active", "trialing"].includes(data.status) && (
          <div className="text-rose-700 bg-rose-50 border border-rose-200 rounded px-2 py-1">
            Subscription status: {data.status}. Update billing to keep sending.
          </div>
        )}
        {(data.pct.sends >= 100 || data.pct.ai >= 100) && (
          <div className="text-amber-700 bg-amber-50 border border-amber-200 rounded px-2 py-1">
            You’ve hit your plan limit. Upgrade to continue.
          </div>
        )}
      </div>
    </div>
  );
}