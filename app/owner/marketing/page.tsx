// Block 27460 — SmartSend Roofing Marketing & Source Attribution Brain v1
// Owner-only view • Track which channels bring the best jobs • Lead source ROI • Cost per booked job

"use client";

import { useEffect, useState } from "react";

interface MarketingSource {
  source: string;
  source_category: string;
  workspace_id: string;
  leads_generated: number;
  jobs_won: number;
  total_revenue: number;
  total_profit: number;
  total_cost: number;
  avg_revenue_per_lead: number;
  avg_profit_per_lead: number;
  roi_multiplier: number;
  cost_per_booked_job: number | null;
  close_rate_pct: number;
}

export default function MarketingPage() {
  const [sources, setSources] = useState<MarketingSource[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/owner/marketing/performance")
      .then((r) => {
        if (!r.ok) {
          throw new Error(`Failed to load: ${r.statusText}`);
        }
        return r.json();
      })
      .then((d) => setSources(d.sources || []))
      .catch((err) => {
        console.error("Marketing performance fetch error:", err);
        setError(err.message);
      })
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="p-6">
        <div className="text-lg">Loading marketing data...</div>
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

  if (!sources || sources.length === 0) {
    return (
      <div className="p-6 space-y-6">
        <h1 className="text-2xl font-bold">Marketing Performance</h1>
        <p className="text-sm text-gray-500">
          SmartSend shows which channels produce the best jobs — and which ones waste money.
        </p>
        <div className="rounded-xl border bg-white p-6 shadow-sm">
          <p className="text-gray-400">
            No marketing data available yet. Start tracking lead sources to see ROI insights.
          </p>
        </div>
      </div>
    );
  }

  // Find best and worst sources
  const bestSource = sources.reduce((best, current) => {
    if (!best) return current;
    const currentROI = current.roi_multiplier || 0;
    const bestROI = best.roi_multiplier || 0;
    return currentROI > bestROI ? current : best;
  }, sources[0]);

  const worstSource = sources.reduce((worst, current) => {
    if (!worst) return current;
    const currentROI = current.roi_multiplier || 0;
    const worstROI = worst.roi_multiplier || 0;
    return currentROI < worstROI ? current : worst;
  }, sources[0]);

  const highestProfit = sources.reduce((best, current) => {
    if (!best) return current;
    return (current.total_profit || 0) > (best.total_profit || 0) ? current : best;
  }, sources[0]);

  const highestCloseRate = sources.reduce((best, current) => {
    if (!best) return current;
    return (current.close_rate_pct || 0) > (best.close_rate_pct || 0) ? current : best;
  }, sources[0]);

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      <div>
        <h1 className="text-2xl font-bold mb-2">Marketing Performance</h1>
        <p className="text-sm text-gray-500">
          SmartSend shows which channels produce the best jobs — and which ones waste money.
        </p>
      </div>

      {/* Insights Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <InsightCard
          title="Best ROI"
          source={bestSource}
          value={`${(bestSource.roi_multiplier || 0).toFixed(2)}x`}
          description="Highest return on investment"
          color="green"
        />
        <InsightCard
          title="Most Profit"
          source={highestProfit}
          value={`$${formatNumber(highestProfit.total_profit || 0)}`}
          description="Highest total profit generated"
          color="blue"
        />
        <InsightCard
          title="Best Close Rate"
          source={highestCloseRate}
          value={`${(highestCloseRate.close_rate_pct || 0).toFixed(1)}%`}
          description="Highest conversion rate"
          color="purple"
        />
        <InsightCard
          title="Needs Attention"
          source={worstSource}
          value={`${(worstSource.roi_multiplier || 0).toFixed(2)}x`}
          description="Lowest ROI - consider optimizing"
          color="red"
        />
      </div>

      {/* Main Table */}
      <div className="rounded-xl border bg-white shadow-sm overflow-hidden">
        <div className="p-4 border-b bg-gray-50">
          <h2 className="font-semibold">Source Performance Breakdown</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-gray-500 border-b bg-gray-50">
                <th align="left" className="p-3">Source</th>
                <th align="left" className="p-3">Category</th>
                <th align="right" className="p-3">Leads</th>
                <th align="right" className="p-3">Jobs Won</th>
                <th align="right" className="p-3">Revenue</th>
                <th align="right" className="p-3">Profit</th>
                <th align="right" className="p-3">Cost</th>
                <th align="right" className="p-3">ROI</th>
                <th align="right" className="p-3">Cost per Job</th>
              </tr>
            </thead>
            <tbody>
              {sources.map((s, idx) => (
                <tr
                  key={`${s.source}-${s.source_category}-${idx}`}
                  className="border-b last:border-0 hover:bg-gray-50"
                >
                  <td className="p-3 font-medium">{s.source || "Unknown"}</td>
                  <td className="p-3">
                    <span className="px-2 py-1 rounded text-xs bg-gray-100 capitalize">
                      {s.source_category || "other"}
                    </span>
                  </td>
                  <td align="right" className="p-3">{s.leads_generated}</td>
                  <td align="right" className="p-3">{s.jobs_won}</td>
                  <td align="right" className="p-3">
                    ${formatNumber(s.total_revenue || 0)}
                  </td>
                  <td align="right" className="p-3">
                    <span className="font-medium text-green-600">
                      ${formatNumber(s.total_profit || 0)}
                    </span>
                  </td>
                  <td align="right" className="p-3">
                    ${formatNumber(s.total_cost || 0)}
                  </td>
                  <td align="right" className="p-3">
                    <span
                      className={`font-medium ${
                        (s.roi_multiplier || 0) > 1
                          ? "text-green-600"
                          : (s.roi_multiplier || 0) > 0
                          ? "text-yellow-600"
                          : "text-red-600"
                      }`}
                    >
                      {(s.roi_multiplier || 0).toFixed(2)}x
                    </span>
                  </td>
                  <td align="right" className="p-3">
                    {s.cost_per_booked_job
                      ? `$${formatNumber(s.cost_per_booked_job)}`
                      : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Key Insights */}
      <div className="rounded-xl border bg-white p-6 shadow-sm">
        <h2 className="font-semibold mb-4">Key Insights</h2>
        <div className="space-y-3">
          {bestSource && bestSource.roi_multiplier && bestSource.roi_multiplier > 0 && (
            <div className="p-3 bg-green-50 rounded-lg">
              <div className="text-sm font-medium text-green-800">
                ✅ Double down on: <strong>{bestSource.source}</strong>
              </div>
              <div className="text-xs text-green-600 mt-1">
                This source has the highest ROI ({bestSource.roi_multiplier.toFixed(2)}x) and generated ${formatNumber(bestSource.total_profit || 0)} in profit.
              </div>
            </div>
          )}
          {worstSource && worstSource.roi_multiplier !== undefined && worstSource.roi_multiplier < 1 && (
            <div className="p-3 bg-red-50 rounded-lg">
              <div className="text-sm font-medium text-red-800">
                ⚠️ Stop spending on: <strong>{worstSource.source}</strong>
              </div>
              <div className="text-xs text-red-600 mt-1">
                This source has a low ROI ({worstSource.roi_multiplier.toFixed(2)}x) and may be losing money. Consider pausing or optimizing.
              </div>
            </div>
          )}
          {highestCloseRate && highestCloseRate.close_rate_pct > 20 && (
            <div className="p-3 bg-blue-50 rounded-lg">
              <div className="text-sm font-medium text-blue-800">
                🎯 High conversion: <strong>{highestCloseRate.source}</strong>
              </div>
              <div className="text-xs text-blue-600 mt-1">
                This source has a {highestCloseRate.close_rate_pct.toFixed(1)}% close rate - focus on scaling this channel.
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function InsightCard({
  title,
  source,
  value,
  description,
  color,
}: {
  title: string;
  source: MarketingSource;
  value: string;
  description: string;
  color: "green" | "blue" | "purple" | "red";
}) {
  const colorClasses = {
    green: "bg-green-50 border-green-200",
    blue: "bg-blue-50 border-blue-200",
    purple: "bg-purple-50 border-purple-200",
    red: "bg-red-50 border-red-200",
  };

  return (
    <div className={`rounded-xl border p-4 ${colorClasses[color]}`}>
      <div className="text-xs font-medium text-gray-600 mb-1">{title}</div>
      <div className="text-2xl font-bold mb-1">{value}</div>
      <div className="text-xs text-gray-500 mb-2">{source.source || "Unknown"}</div>
      <div className="text-xs text-gray-400">{description}</div>
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



































