// app/(dashboard)/DashboardSummaryCards.tsx
"use client";

import { useEffect, useState } from "react";

type SummaryResponse = {
  hot_leads_count: number;
  follow_up_count: number;
  emails_sent_today: number;
  replies_today: number;
  hot_replies_today: number;
  pipeline_value: number;
  jobs_won_this_month: number;
  revenue_won_this_month: number;
};

export function DashboardSummaryCards() {
  const [data, setData] = useState<SummaryResponse | null>(null);
  const [loading, setLoading] = useState(true);

  async function fetchSummary() {
    try {
      const res = await fetch("/api/dashboard/summary", {
        method: "GET",
        cache: "no-store",
      });

      if (!res.ok) throw new Error("Failed to fetch dashboard summary");

      const json: SummaryResponse = await res.json();
      setData(json);
    } catch (err) {
      console.error("Error loading dashboard summary:", err);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchSummary();
    const interval = setInterval(fetchSummary, 15_000); // refresh every 15s
    return () => clearInterval(interval);
  }, []);

  if (loading) {
    return (
      <div className="grid gap-4 md:grid-cols-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <div
            key={i}
            className="h-24 animate-pulse rounded-2xl bg-neutral-900/70"
          />
        ))}
      </div>
    );
  }

  if (!data) {
    return (
      <div className="text-sm text-red-400">
        Failed to load dashboard metrics.
      </div>
    );
  }

  const {
    hot_leads_count,
    follow_up_count,
    emails_sent_today,
    replies_today,
    hot_replies_today,
    pipeline_value,
    jobs_won_this_month,
    revenue_won_this_month,
  } = data;

  const fmtCurrency = (value: number) =>
    value.toLocaleString(undefined, {
      style: "currency",
      currency: "USD",
      maximumFractionDigits: 0,
    });

  return (
    <div className="grid gap-4 md:grid-cols-3">
      {/* Hot Leads */}
      <div className="flex flex-col justify-between rounded-2xl border border-amber-700/60 bg-neutral-950/80 px-4 py-3">
        <div className="text-xs font-semibold uppercase tracking-wide text-amber-400">
          Hot Leads
        </div>
        <div className="flex items-end justify-between">
          <span className="text-3xl font-semibold text-neutral-50">
            {hot_leads_count}
          </span>
          <span className="text-[0.75rem] text-neutral-400">
            Homeowners ready to talk
          </span>
        </div>
      </div>

      {/* Follow-Up Queue */}
      <div className="flex flex-col justify-between rounded-2xl border border-neutral-800 bg-neutral-950/80 px-4 py-3">
        <div className="text-xs font-semibold uppercase tracking-wide text-neutral-300">
          Follow-Ups Due
        </div>
        <div className="flex items-end justify-between">
          <span className="text-3xl font-semibold text-neutral-50">
            {follow_up_count}
          </span>
          <span className="text-[0.75rem] text-neutral-400">
            Leads to call/email today
          </span>
        </div>
      </div>

      {/* Pipeline Value */}
      <div className="flex flex-col justify-between rounded-2xl border border-neutral-800 bg-neutral-950/80 px-4 py-3">
        <div className="text-xs font-semibold uppercase tracking-wide text-neutral-300">
          Estimated Pipeline
        </div>
        <div className="flex items-end justify-between">
          <span className="text-2xl font-semibold text-neutral-50">
            {fmtCurrency(pipeline_value)}
          </span>
          <span className="text-[0.75rem] text-neutral-400">
            Open & in-progress jobs
          </span>
        </div>
      </div>

      {/* Emails & Replies Today (full-width on small, 2 cols on md) */}
      <div className="md:col-span-3 grid gap-4 md:grid-cols-2">
        <div className="flex flex-col justify-between rounded-2xl border border-neutral-800 bg-neutral-950/80 px-4 py-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wide text-neutral-300">
              Emails & Replies Today
            </span>
            <span className="rounded-full bg-neutral-800 px-2 py-0.5 text-[0.65rem] font-semibold uppercase tracking-wide text-neutral-300">
              {emails_sent_today} / {replies_today}
            </span>
          </div>
          <div className="mt-2 flex items-end justify-between">
            <div className="flex flex-col">
              <span className="text-xs text-neutral-400">Hot replies</span>
              <span className="text-xl font-semibold text-amber-400">
                {hot_replies_today}
              </span>
            </div>
            <span className="text-[0.75rem] text-neutral-400">
              Homeowners who answered today
            </span>
          </div>
        </div>

        {/* Jobs Won This Month */}
        <div className="flex flex-col justify-between rounded-2xl border border-emerald-700/70 bg-neutral-950/80 px-4 py-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wide text-emerald-300">
              Jobs Won This Month
            </span>
          </div>
          <div className="mt-2 flex items-end justify-between">
            <span className="text-3xl font-semibold text-neutral-50">
              {jobs_won_this_month}
            </span>
            <div className="flex flex-col items-end text-[0.75rem] text-neutral-300">
              <span>Total Revenue:</span>
              <span className="text-base font-semibold text-emerald-300">
                {fmtCurrency(revenue_won_this_month)}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
