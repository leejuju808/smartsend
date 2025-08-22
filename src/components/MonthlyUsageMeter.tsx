"use client";
import { useEffect, useState } from "react";

type Summary = {
  ok: boolean;
  plan: "free"|"pro"|"other";
  used: number;
  limit: number;
  remaining: number;
  resetsAt: string;
};

export default function MonthlyUsageMeter() {
  const [s, setS] = useState<Summary | null>(null);

  useEffect(() => {
    fetch("/api/usage/summary-monthly", { cache: 'no-store' })
      .then(r => r.json())
      .then(setS)
      .catch(() => setS(null));
  }, []);

  if (!s?.ok) return null;

  const pct = Math.min(100, Math.round((s.used / Math.max(1, s.limit)) * 100));
  const nearCap = s.plan !== "pro" && pct >= 80 && pct < 100;
  const atCap = s.plan !== "pro" && s.used >= s.limit;

  const resetDate = new Date(s.resetsAt).toLocaleDateString(undefined, {
    month: "short", day: "numeric"
  });

  const billingHref = "/dashboard/billing";

  return (
    <div className="rounded-2xl border p-4 bg-white">
      <div className="flex items-center justify-between text-sm">
        <span>Monthly sends</span>
        <span>{s.used} / {s.limit}</span>
      </div>
      <div className="mt-2 h-2 w-full rounded-full bg-gray-100">
        <div className="h-2 rounded-full bg-black" style={{ width: `${pct}%` }} />
      </div>
      <div className="mt-2 text-xs text-gray-600">Resets {resetDate}</div>

      {nearCap && (
        <div className="mt-3 rounded-xl border bg-yellow-50 px-3 py-2 text-xs">
          You’re nearing the Free plan limit. Unlock higher limits and automations with Pro.
          <a href={billingHref} className="ml-2 underline">Upgrade</a>
        </div>
      )}

      {atCap && (
        <div className="mt-3 rounded-xl border bg-red-50 px-3 py-2 text-xs">
          You’ve hit the Free plan limit. Upgrade to keep sending today.
          <a href={billingHref} className="ml-2 underline">Upgrade</a>
        </div>
      )}
    </div>
  );
}

