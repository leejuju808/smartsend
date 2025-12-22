"use client";

import { useEffect, useState } from "react";

type Summary = {
  account_id: string;
  total_replies: number;
  contacts_replied: number;
  hot_leads: number;
  warm_leads: number;
  follow_up_leads: number;
  not_interested_leads: number;
  open_pipeline_value: string | number;
  won_revenue_value: string | number;
};

export function RevenueActivityCards() {
  const [summary, setSummary] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        const res = await fetch("/api/dashboard/summary");
        const json = await res.json();
        if (json.ok) setSummary(json.summary);
      } catch (e) {
        console.error("[RevenueActivityCards] load error", e);
      } finally {
        setLoading(false);
      }
    };

    load();
  }, []);

  if (loading && !summary) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div
            key={i}
            className="rounded-2xl border border-zinc-800 p-4 animate-pulse"
          >
            <div className="h-3 w-20 bg-zinc-800 rounded" />
            <div className="mt-3 h-5 w-16 bg-zinc-800 rounded" />
          </div>
        ))}
      </div>
    );
  }

  if (!summary) return null;

  const fmt = (val: string | number) =>
    new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      maximumFractionDigits: 0,
    }).format(Number(val || 0));

  return (
    <section className="grid grid-cols-1 md:grid-cols-4 gap-4">
      <div className="rounded-2xl border border-zinc-800 p-4">
        <p className="text-xs text-zinc-400">Total Replies</p>
        <p className="mt-1 text-3xl font-semibold text-zinc-50">
          {summary.total_replies}
        </p>
        <p className="mt-1 text-[11px] text-zinc-500">
          {summary.contacts_replied} unique contacts replied
        </p>
      </div>

      <div className="rounded-2xl border border-emerald-500/60 p-4">
        <p className="text-xs text-emerald-300">High-Value Leads</p>
        <p className="mt-1 text-3xl font-semibold text-emerald-300">
          {summary.hot_leads}
        </p>
        <p className="mt-1 text-[11px] text-emerald-100/80">
          {summary.warm_leads} warm · {summary.follow_up_leads} follow-up
        </p>
      </div>

      <div className="rounded-2xl border border-amber-400/70 p-4">
        <p className="text-xs text-amber-200">Open Pipeline Value</p>
        <p className="mt-1 text-3xl font-semibold text-amber-200">
          {fmt(summary.open_pipeline_value)}
        </p>
        <p className="mt-1 text-[11px] text-amber-100/80">
          Estimated value from open leads
        </p>
      </div>

      <div className="rounded-2xl border border-emerald-500/80 p-4">
        <p className="text-xs text-emerald-300">Won Revenue</p>
        <p className="mt-1 text-3xl font-semibold text-emerald-300">
          {fmt(summary.won_revenue_value)}
        </p>
        <p className="mt-1 text-[11px] text-emerald-100/80">
          Closed jobs tracked in SmartSend
        </p>
      </div>
    </section>
  );
}






























































