// Block 26410 — SmartSend Roofing Lead Source ROI Tracker v1
// Owner-only view • Compare SmartSend vs ads vs referrals • Close the loop from lead → job → profit

"use client";

import { useEffect, useState } from "react";

type ReplacementRow = {
  channel: "smartsend" | "ads" | "agency";
  cost: number | null;
  closed_jobs: number;
  cost_per_closed_job: number | null;
  smartsend_outperforming: boolean;
};

type ReplacementThresholdsResponse = {
  windowDays: number;
  rows: ReplacementRow[];
  continuity: null | {
    channel_type: "ads" | "lead_service" | "agency";
    started_at: string;
    emails_sent: number;
    replies: number;
    smartsend_jobs_closed: number;
  };
};

interface LeadSourceROI {
  lead_source_id: string;
  workspace_id: string;
  lead_source_name: string;
  channel_type: string;
  total_leads: number;
  jobs_sold: number;
  close_rate_pct: number;
  total_revenue: number;
  total_gross_profit: number;
  channel_cost_estimate: number;
  roi_pct: number | null;
}

interface ComparisonData {
  workspace_id: string;
  category: string;
  total_leads: number;
  jobs_sold: number;
  revenue: number;
  profit: number;
  total_cost: number;
}

interface ROIResponse {
  sources: LeadSourceROI[];
  comparison: ComparisonData[];
}

function formatCurrency(value: number | null | undefined) {
  if (value == null || !Number.isFinite(Number(value))) return "—";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(Number(value));
}

function formatDateShort(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export default function MarketingRoiPage() {
  const [data, setData] = useState<ROIResponse | null>(null);
  const [thresholds, setThresholds] = useState<ReplacementThresholdsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    Promise.all([
      fetch("/api/lead-source-roi").then(async (r) => {
        if (!r.ok) throw new Error(`Failed to load ROI: ${r.statusText}`);
        return (await r.json()) as ROIResponse;
      }),
      fetch("/api/replacement-thresholds").then(async (r) => {
        if (!r.ok) throw new Error(`Failed to load thresholds: ${r.statusText}`);
        return (await r.json()) as ReplacementThresholdsResponse;
      }),
    ])
      .then(([roi, repl]) => {
        if (!mounted) return;
        setData(roi);
        setThresholds(repl);
      })
      .catch((err) => {
        console.error("Marketing ROI page load error:", err);
        if (!mounted) return;
        setError(err.message);
      })
      .finally(() => {
        if (!mounted) return;
        setLoading(false);
      });
    return () => {
      mounted = false;
    };
  }, []);

  const refreshThresholds = async () => {
    const res = await fetch("/api/replacement-thresholds", { cache: "no-store" });
    if (res.ok) {
      const json = (await res.json()) as ReplacementThresholdsResponse;
      setThresholds(json);
    }
  };

  const setPauseTest = async (action: "start" | "stop", channel_type: "ads" | "agency") => {
    await fetch("/api/replacement-thresholds/pause-test", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, channel_type }),
    });
    await refreshThresholds();
  };

  if (loading) {
    return (
      <div className="p-6">
        <div className="text-lg">Loading ROI data...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6">
        <div className="text-red-600">Error: {error}</div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="p-6">
        <div>No data available</div>
      </div>
    );
  }

  const { sources, comparison } = data;

  const smartsend = comparison.find((c) => c.category === "SmartSend");
  const nonSmart = comparison.find((c) => c.category === "Non-SmartSend");

  const rowFor = (channel: ReplacementRow["channel"]) =>
    thresholds?.rows?.find((r) => r.channel === channel) ?? null;
  const ss = rowFor("smartsend");
  const ads = rowFor("ads");
  const agency = rowFor("agency");

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      <div className="mb-6">
        <h1 className="text-3xl font-bold mb-2">Lead Source ROI</h1>
        <p className="text-gray-600">
          Track which channels make real profit. Compare SmartSend vs ads vs referrals.
        </p>
      </div>

      {/* Block 272300 — Replacement Thresholds (3 lines, raw) */}
      <div className="rounded-xl border bg-white p-4 shadow-sm">
        <div className="text-sm font-semibold mb-3">Replacement Thresholds (last {thresholds?.windowDays ?? 30} days)</div>
        <div className="space-y-2 text-sm">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <span className="text-gray-700">Cost per closed job (SmartSend)</span>
            <span className="font-semibold tabular-nums">
              {formatCurrency(ss?.cost_per_closed_job ?? null)}
            </span>
          </div>
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <span className="text-gray-700">
              Cost per closed job (Ads / Lead services)
              {ads?.smartsend_outperforming ? (
                <span className="ml-2 text-xs text-gray-500">
                  SmartSend is outperforming this channel.
                </span>
              ) : null}
            </span>
            <span className="font-semibold tabular-nums">
              {formatCurrency(ads?.cost_per_closed_job ?? null)}
            </span>
          </div>
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <span className="text-gray-700">
              Cost per closed job (Agency)
              {agency?.smartsend_outperforming ? (
                <span className="ml-2 text-xs text-gray-500">
                  SmartSend is outperforming this channel.
                </span>
              ) : null}
            </span>
            <span className="font-semibold tabular-nums">
              {formatCurrency(agency?.cost_per_closed_job ?? null)}
            </span>
          </div>
        </div>
      </div>

      {/* Block 272300 — Revenue Continuity Test */}
      <div className="rounded-xl border bg-white p-4 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="text-sm font-semibold">Revenue Continuity Test</div>
            <div className="text-xs text-gray-500">
              Pause a channel. SmartSend keeps running. Watch what keeps happening.
            </div>
          </div>
          {thresholds?.continuity ? (
            <button
              onClick={() => setPauseTest("stop", thresholds.continuity?.channel_type === "agency" ? "agency" : "ads")}
              className="px-3 py-2 rounded-lg border text-sm hover:bg-gray-50"
            >
              Stop test
            </button>
          ) : (
            <div className="flex items-center gap-2">
              <button
                onClick={() => setPauseTest("start", "ads")}
                className="px-3 py-2 rounded-lg border text-sm hover:bg-gray-50"
              >
                Pause Ads / Lead services
              </button>
              <button
                onClick={() => setPauseTest("start", "agency")}
                className="px-3 py-2 rounded-lg border text-sm hover:bg-gray-50"
              >
                Pause Agency
              </button>
            </div>
          )}
        </div>

        {thresholds?.continuity ? (
          <div className="mt-4 grid grid-cols-1 md:grid-cols-4 gap-3 text-sm">
            <div className="rounded-lg border p-3">
              <div className="text-xs text-gray-500">Paused channel</div>
              <div className="font-semibold capitalize">{thresholds.continuity.channel_type.replace("_", " ")}</div>
              <div className="text-xs text-gray-500 mt-1">Since {formatDateShort(thresholds.continuity.started_at)}</div>
            </div>
            <div className="rounded-lg border p-3">
              <div className="text-xs text-gray-500">Outreach continues</div>
              <div className="font-semibold tabular-nums">{thresholds.continuity.emails_sent}</div>
            </div>
            <div className="rounded-lg border p-3">
              <div className="text-xs text-gray-500">Replies continue</div>
              <div className="font-semibold tabular-nums">{thresholds.continuity.replies}</div>
            </div>
            <div className="rounded-lg border p-3">
              <div className="text-xs text-gray-500">Jobs continue</div>
              <div className="font-semibold tabular-nums">{thresholds.continuity.smartsend_jobs_closed}</div>
            </div>
          </div>
        ) : null}
      </div>

      {/* SmartSend vs Others */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <CompareCard
          title="SmartSend vs Other Channels (Profit)"
          smartsend={smartsend}
          nonSmart={nonSmart}
        />
        <SummaryCard sources={sources} />
      </div>

      {/* Table of all sources */}
      <SourcesTable sources={sources} />
    </div>
  );
}

function CompareCard({
  title,
  smartsend,
  nonSmart,
}: {
  title: string;
  smartsend?: ComparisonData;
  nonSmart?: ComparisonData;
}) {
  const ssProfit = Number(smartsend?.profit || 0);
  const otherProfit = Number(nonSmart?.profit || 0);
  const ssCost = Number(smartsend?.total_cost || 0);
  const otherCost = Number(nonSmart?.total_cost || 0);

  return (
    <div className="rounded-xl border bg-white p-4 shadow-sm">
      <h2 className="font-semibold mb-3">{title}</h2>
      <div className="space-y-4">
        <div className="flex justify-between items-end">
          <div>
            <div className="text-xs text-gray-500 mb-1">SmartSend Profit</div>
            <div className="text-2xl font-bold text-green-600">
              ${formatNumber(ssProfit)}
            </div>
            {ssCost > 0 && (
              <div className="text-xs text-gray-400 mt-1">
                Cost: ${formatNumber(ssCost)}
              </div>
            )}
          </div>
          <div>
            <div className="text-xs text-gray-500 mb-1">Other Channels Profit</div>
            <div className="text-2xl font-bold text-gray-800">
              ${formatNumber(otherProfit)}
            </div>
            {otherCost > 0 && (
              <div className="text-xs text-gray-400 mt-1">
                Cost: ${formatNumber(otherCost)}
              </div>
            )}
          </div>
        </div>
        {ssProfit > otherProfit && (
          <div className="mt-3 p-3 bg-green-50 rounded-lg">
            <div className="text-sm text-green-700 font-medium">
              SmartSend is currently more profitable than other channels.
            </div>
            {ssCost > 0 && otherCost > 0 && (
              <div className="text-xs text-green-600 mt-1">
                SmartSend ROI: {((ssProfit - ssCost) / ssCost * 100).toFixed(1)}% vs Other Channels ROI: {((otherProfit - otherCost) / otherCost * 100).toFixed(1)}%
              </div>
            )}
          </div>
        )}
        {ssProfit <= otherProfit && ssProfit > 0 && (
          <div className="mt-3 p-3 bg-yellow-50 rounded-lg">
            <div className="text-sm text-yellow-700">
              Other channels are currently more profitable.
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function SummaryCard({ sources }: { sources: LeadSourceROI[] }) {
  const totalLeads = sources.reduce((s, src) => s + (src.total_leads || 0), 0);
  const totalJobs = sources.reduce((s, src) => s + (src.jobs_sold || 0), 0);
  const totalProfit = sources.reduce(
    (s, src) => s + (Number(src.total_gross_profit) || 0),
    0
  );
  const avgCloseRate =
    sources.length > 0
      ? sources.reduce((s, src) => s + (src.close_rate_pct || 0), 0) /
        sources.length
      : 0;

  return (
    <div className="rounded-xl border bg-white p-4 shadow-sm">
      <h2 className="font-semibold mb-3">Marketing Performance Summary</h2>
      <div className="grid grid-cols-2 gap-4">
        <Metric label="Total Leads" value={totalLeads} />
        <Metric label="Jobs Sold" value={totalJobs} />
        <Metric label="Total Profit Attributed" value={`$${formatNumber(totalProfit)}`} />
        <Metric label="Avg Close Rate" value={`${avgCloseRate.toFixed(1)}%`} />
      </div>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string | number }) {
  return (
    <div>
      <div className="text-xs text-gray-500">{label}</div>
      <div className="text-xl font-bold">{value}</div>
    </div>
  );
}

function SourcesTable({ sources }: { sources: LeadSourceROI[] }) {
  if (!sources || sources.length === 0) {
    return (
      <div className="rounded-xl border bg-white p-4 shadow-sm">
        <h2 className="font-semibold mb-3">Lead Source Breakdown</h2>
        <div className="text-sm text-gray-400">No lead sources found. Add lead sources to start tracking ROI.</div>
      </div>
    );
  }

  return (
    <div className="rounded-xl border bg-white p-4 shadow-sm">
      <h2 className="font-semibold mb-3">Lead Source Breakdown</h2>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-gray-500 border-b">
              <th align="left" className="pb-2">Source</th>
              <th align="left" className="pb-2">Type</th>
              <th align="right" className="pb-2">Leads</th>
              <th align="right" className="pb-2">Jobs</th>
              <th align="right" className="pb-2">Close %</th>
              <th align="right" className="pb-2">Revenue</th>
              <th align="right" className="pb-2">Profit</th>
              <th align="right" className="pb-2">Est. Cost</th>
              <th align="right" className="pb-2">ROI %</th>
            </tr>
          </thead>
          <tbody>
            {sources.map((s) => (
              <tr key={s.lead_source_id} className="border-b last:border-0">
                <td className="py-2">{s.lead_source_name}</td>
                <td className="py-2 capitalize">{s.channel_type}</td>
                <td align="right" className="py-2">{s.total_leads}</td>
                <td align="right" className="py-2">{s.jobs_sold}</td>
                <td align="right" className="py-2">
                  {Number(s.close_rate_pct).toFixed(1)}%
                </td>
                <td align="right" className="py-2">
                  ${formatNumber(Number(s.total_revenue || 0))}
                </td>
                <td align="right" className="py-2">
                  ${formatNumber(Number(s.total_gross_profit || 0))}
                </td>
                <td align="right" className="py-2">
                  {s.channel_cost_estimate
                    ? `$${formatNumber(Number(s.channel_cost_estimate))}`
                    : "—"}
                </td>
                <td
                  align="right"
                  className={`py-2 font-medium ${
                    s.roi_pct == null
                      ? ""
                      : Number(s.roi_pct) < 0
                      ? "text-red-600"
                      : "text-green-600"
                  }`}
                >
                  {s.roi_pct == null ? "—" : `${Number(s.roi_pct).toFixed(1)}%`}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function formatNumber(num: number): string {
  if (num >= 1000000) {
    return (num / 1000000).toFixed(1) + "M";
  }
  if (num >= 1000) {
    return (num / 1000).toFixed(0) + "K";
  }
  return num.toFixed(0);
}



































