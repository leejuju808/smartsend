"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

type CampaignPerformance = {
  campaign_id: string;
  campaign_name: string | null;
  created_at: string;
  total_sends: number;
  total_replies: number;
  hot_replies: number;
  total_leads: number;
  open_pipeline_value: number;
};

export function CampaignPerformanceTable() {
  const [rows, setRows] = useState<CampaignPerformance[]>([]);
  const [loading, setLoading] = useState(true);

  async function fetchPerformance() {
    try {
      const res = await fetch("/api/campaigns/performance?limit=50", {
        method: "GET",
        cache: "no-store",
      });

      if (!res.ok) throw new Error("Failed to fetch campaign performance");

      const data: CampaignPerformance[] = await res.json();
      setRows(data);
    } catch (err) {
      console.error("Error loading campaign performance:", err);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchPerformance();
    const interval = setInterval(fetchPerformance, 20_000);
    return () => clearInterval(interval);
  }, []);

  if (loading) {
    return (
      <div className="mt-4 rounded-2xl border border-neutral-800 bg-neutral-950/80 p-4 text-sm text-neutral-400">
        Loading campaign performance…
      </div>
    );
  }

  if (!rows.length) {
    return (
      <div className="mt-4 rounded-2xl border border-neutral-800 bg-neutral-950/80 p-4 text-sm text-neutral-400">
        No campaigns yet. Create a campaign to start tracking performance.
      </div>
    );
  }

  const fmtCurrency = (value: number) =>
    value.toLocaleString(undefined, {
      style: "currency",
      currency: "USD",
      maximumFractionDigits: 0,
    });

  const fmtPercent = (num: number, den: number) => {
    if (!den || den === 0) return "0%";
    const pct = (num / den) * 100;
    return `${pct.toFixed(1)}%`;
  };

  return (
    <div className="mt-4 overflow-hidden rounded-2xl border border-neutral-800 bg-neutral-950/80">
      <table className="min-w-full text-left text-sm">
        <thead className="border-b border-neutral-800 bg-neutral-950">
          <tr>
            <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-neutral-400">
              Campaign
            </th>
            <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-neutral-400">
              Sends
            </th>
            <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-neutral-400">
              Replies
            </th>
            <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-neutral-400">
              Hot
            </th>
            <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-neutral-400">
              Leads
            </th>
            <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-neutral-400">
              Pipeline
            </th>
            <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-neutral-400">
              Rates
            </th>
            <th className="px-4 py-3" />
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const replyRate = fmtPercent(row.total_replies, row.total_sends);
            const hotRate = fmtPercent(row.hot_replies, row.total_sends);

            return (
              <tr
                key={row.campaign_id}
                className="border-t border-neutral-900 hover:bg-neutral-900/60"
              >
                <td className="px-4 py-3 align-middle">
                  <div className="flex flex-col">
                    <span className="text-sm font-semibold text-neutral-50">
                      {row.campaign_name || "Untitled campaign"}
                    </span>
                    <span className="text-[0.75rem] text-neutral-500">
                      Started{" "}
                      {new Date(row.created_at).toLocaleDateString()}
                    </span>
                  </div>
                </td>
                <td className="px-4 py-3 align-middle text-sm text-neutral-100">
                  {row.total_sends}
                </td>
                <td className="px-4 py-3 align-middle text-sm text-neutral-100">
                  {row.total_replies}
                </td>
                <td className="px-4 py-3 align-middle text-sm text-amber-400">
                  {row.hot_replies}
                </td>
                <td className="px-4 py-3 align-middle text-sm text-neutral-100">
                  {row.total_leads}
                </td>
                <td className="px-4 py-3 align-middle text-sm text-neutral-100">
                  {fmtCurrency(row.open_pipeline_value)}
                </td>
                <td className="px-4 py-3 align-middle text-xs text-neutral-300">
                  <div className="flex flex-col gap-1">
                    <span>Reply: {replyRate}</span>
                    <span>Hot: {hotRate}</span>
                  </div>
                </td>
                <td className="px-4 py-3 align-middle text-right">
                  <Link
                    href={`/campaigns/${row.campaign_id}`}
                    className="rounded-xl border border-neutral-700 px-3 py-1 text-xs font-semibold text-neutral-100"
                  >
                    View Campaign
                  </Link>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

























































