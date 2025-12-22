// app/(dashboard)/BillingUsageBadge.tsx
"use client";

import { useEffect, useState } from "react";

type Usage = {
  plan_code: string;
  email_quota: number | null;
  emails_sent: number;
  emails_remaining: number | null;
  percent_used: number | null;
  period_start: string;
  period_end: string;
};

function formatPlanName(code: string) {
  switch (code) {
    case "starter":
      return "Starter";
    case "growth":
      return "Growth";
    case "domination":
      return "Domination";
    case "trial":
    default:
      return "Trial";
  }
}

export function BillingUsageBadge() {
  const [usage, setUsage] = useState<Usage | null>(null);

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch("/api/billing/usage", {
          cache: "no-store",
        });
        if (!res.ok) return;
        const data = await res.json();
        setUsage(data);
      } catch (e) {
        console.error("Billing usage load error:", e);
      }
    }

    load();
  }, []);

  if (!usage) return null;

  const planName = formatPlanName(usage.plan_code);
  const quotaLabel =
    usage.email_quota != null
      ? `${usage.emails_sent} / ${usage.email_quota} emails`
      : `${usage.emails_sent} emails (unlimited)`;

  const pct = usage.percent_used ?? 0;

  return (
    <div className="flex items-center gap-3 rounded-2xl border border-neutral-800 bg-neutral-950/80 px-3 py-2 text-xs">
      <span className="rounded-full bg-neutral-200/10 px-2 py-1 text-[0.65rem] font-semibold uppercase tracking-wide text-neutral-100">
        Plan: {planName}
      </span>
      <div className="flex flex-col">
        <span className="text-[0.7rem] text-neutral-400">
          {quotaLabel} this period
        </span>
        {usage.email_quota != null && (
          <div className="mt-1 h-1.5 w-40 overflow-hidden rounded-full bg-neutral-800">
            <div
              className={`h-full ${
                pct > 90
                  ? "bg-red-500"
                  : pct > 70
                  ? "bg-amber-400"
                  : "bg-emerald-400"
              }`}
              style={{ width: `${pct}%` }}
            />
          </div>
        )}
      </div>
    </div>
  );
}

