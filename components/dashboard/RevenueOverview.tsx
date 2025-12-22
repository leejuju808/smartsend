"use client";

import { useEffect, useState } from "react";

type MonthRow = {
  month: string;
  won_jobs: number;
  sent_quotes: number;
  closed_revenue: number;
  avg_job_size: number;
  close_rate_percent: number;
};

type RevenueSummary = {
  start: string;
  end: string;
  months: MonthRow[];
  overall: {
    won_jobs: number;
    sent_quotes: number;
    closed_revenue: number;
    avg_job_size: number;
    close_rate_percent: number;
  };
};

export function RevenueOverview() {
  const [data, setData] = useState<RevenueSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [months, setMonths] = useState(6);

  useEffect(() => {
    setLoading(true);
    fetch(`/api/revenue/summary?months=${months}`)
      .then((r) => r.json())
      .then((res) => {
        setData(res);
        setLoading(false);
      })
      .catch((err) => {
        console.error("Error fetching revenue summary:", err);
        setLoading(false);
      });
  }, [months]);

  if (loading) {
    return (
      <div className="rounded-xl bg-white/5 border border-white/10 p-4 text-sm text-gray-400">
        Loading revenue…
      </div>
    );
  }

  if (!data) return null;

  const o = data.overall;

  return (
    <div className="rounded-xl bg-white/5 border border-white/10 p-4 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-xs text-gray-400 uppercase tracking-wide">
            Revenue (SmartSend Jobs)
          </div>
          <div className="text-[11px] text-gray-400">
            Last {months} month{months > 1 ? "s" : ""}
          </div>
        </div>
        <select
          value={months}
          onChange={(e) => setMonths(Number(e.target.value))}
          className="bg-black border border-white/10 text-xs text-gray-200 rounded-lg px-2 py-1"
        >
          <option value={3}>Last 3 months</option>
          <option value={6}>Last 6 months</option>
          <option value={12}>Last 12 months</option>
        </select>
      </div>

      {/* Top metrics */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
        <Metric
          label="Closed revenue"
          value={`$${Number(o.closed_revenue || 0).toLocaleString()}`}
          highlight
        />
        <Metric
          label="Won jobs"
          value={o.won_jobs}
          sub={`of ${o.sent_quotes} quotes`}
        />
        <Metric
          label="Avg job size"
          value={`$${Number(o.avg_job_size || 0).toLocaleString()}`}
        />
        <Metric
          label="Close rate"
          value={`${Number(o.close_rate_percent || 0).toFixed(1)}%`}
        />
      </div>

      {/* Monthly rows */}
      <div className="mt-2 border-t border-white/10 pt-2">
        <div className="text-[11px] text-gray-400 mb-1">
          Monthly breakdown
        </div>
        <div className="space-y-1">
          {data.months.map((m) => (
            <div
              key={m.month}
              className="flex items-center justify-between text-[11px] text-gray-200 bg-black/30 border border-white/10 rounded-lg px-2 py-1.5"
            >
              <div>
                <div className="font-semibold">{formatMonth(m.month)}</div>
                <div className="text-[10px] text-gray-400">
                  {m.won_jobs} won / {m.sent_quotes} quoted
                </div>
              </div>
              <div className="text-right">
                <div className="text-yellow-300 font-semibold">
                  ${Number(m.closed_revenue || 0).toLocaleString()}
                </div>
                <div className="text-[10px] text-gray-400">
                  Avg ${Number(m.avg_job_size || 0).toLocaleString()} •{" "}
                  {Number(m.close_rate_percent || 0).toFixed(1)}% close
                </div>
              </div>
            </div>
          ))}

          {data.months.length === 0 && (
            <div className="text-[11px] text-gray-500">
              No accepted quotes in this period yet.
            </div>
          )}
        </div>
      </div>

      <div className="text-[10px] text-gray-500">
        *Revenue is based on accepted SmartSend estimates. This shows only jobs
        tracked through SmartSend.
      </div>
    </div>
  );
}

function Metric({
  label,
  value,
  sub,
  highlight,
}: {
  label: string;
  value: string | number;
  sub?: string;
  highlight?: boolean;
}) {
  return (
    <div
      className={`rounded-lg px-3 py-2 border text-xs ${
        highlight
          ? "border-yellow-500/70 bg-yellow-500/10 text-yellow-100"
          : "border-white/10 bg-black/40 text-gray-200"
      }`}
    >
      <div className="text-[10px] text-gray-400">{label}</div>
      <div className="text-sm font-semibold">{value}</div>
      {sub && <div className="text-[10px] text-gray-400 mt-0.5">{sub}</div>}
    </div>
  );
}

function formatMonth(m: string) {
  // "2025-01" -> "Jan 2025"
  const [year, month] = m.split("-");
  const date = new Date(Number(year), Number(month) - 1, 1);
  return date.toLocaleString("default", { month: "short", year: "numeric" });
}










































