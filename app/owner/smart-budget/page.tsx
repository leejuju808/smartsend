// Block 26480 — SmartSend Roofing Smart Budget Allocator v1
// Owner-only view • Budget recommendations • Channel ranking • Budget simulation

"use client";

import { useEffect, useState } from "react";

interface Recommendation {
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
  recommendation: string;
  priority_score: number;
}

interface BudgetShift {
  lead_source_id: string;
  workspace_id: string;
  lead_source_name: string;
  channel_type: string;
  roi_pct: number | null;
  current_budget: number;
  suggested_reduce: number;
  suggested_increase: number;
}

interface SmartBudgetData {
  recommendations: Recommendation[];
  shifts: BudgetShift[];
}

export default function SmartBudgetPage() {
  const [data, setData] = useState<SmartBudgetData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/smart-budget")
      .then((r) => {
        if (!r.ok) {
          throw new Error(`Failed to load: ${r.statusText}`);
        }
        return r.json();
      })
      .then(setData)
      .catch((err) => {
        console.error("Smart budget fetch error:", err);
        setError(err.message);
      })
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="p-6">
        <div className="text-lg">Loading Smart Budget...</div>
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

  const { recommendations, shifts } = data;

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      <div className="mb-6">
        <h1 className="text-3xl font-bold mb-2">Smart Budget Allocator</h1>
        <p className="text-gray-600">
          SmartSend analyzes channel ROI and tells you where to CUT, KEEP, REWORK, or DOUBLE DOWN.
        </p>
      </div>

      <RecommendationsTable recs={recommendations} />

      <div className="pt-4">
        <BudgetShiftPanel shifts={shifts} />
      </div>
    </div>
  );
}

function RecommendationsTable({ recs }: { recs: Recommendation[] }) {
  if (!recs || recs.length === 0) {
    return (
      <div className="rounded-xl border bg-white p-4 shadow-sm">
        <h2 className="font-semibold mb-3">Channel Recommendations</h2>
        <div className="text-sm text-gray-400">No channel data available. Set up lead sources to see recommendations.</div>
      </div>
    );
  }

  const getRecommendationColor = (rec: string) => {
    switch (rec) {
      case "cut":
        return "text-red-600 font-semibold";
      case "double_down":
        return "text-green-600 font-semibold";
      case "rework":
        return "text-yellow-600";
      case "keep":
        return "text-blue-600";
      default:
        return "text-gray-500";
    }
  };

  const getRecommendationLabel = (rec: string) => {
    switch (rec) {
      case "cut":
        return "CUT IMMEDIATELY";
      case "double_down":
        return "DOUBLE DOWN";
      case "rework":
        return "REWORK";
      case "keep":
        return "KEEP";
      case "insufficient_data":
        return "INSUFFICIENT DATA";
      default:
        return rec.toUpperCase().replace("_", " ");
    }
  };

  return (
    <div className="rounded-xl border bg-white p-4 shadow-sm">
      <h2 className="font-semibold mb-3">Channel Recommendations</h2>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-gray-500 border-b">
              <th align="left" className="pb-2">Source</th>
              <th align="left" className="pb-2">Type</th>
              <th align="right" className="pb-2">Leads</th>
              <th align="right" className="pb-2">Jobs Sold</th>
              <th align="right" className="pb-2">Close Rate</th>
              <th align="right" className="pb-2">Revenue</th>
              <th align="right" className="pb-2">Profit</th>
              <th align="right" className="pb-2">Cost</th>
              <th align="right" className="pb-2">ROI%</th>
              <th align="right" className="pb-2">Recommendation</th>
            </tr>
          </thead>
          <tbody>
            {recs.map((r) => (
              <tr key={r.lead_source_id} className="border-b last:border-0 hover:bg-gray-50">
                <td className="py-2 font-medium">{r.lead_source_name}</td>
                <td className="py-2 text-gray-600">{r.channel_type}</td>
                <td align="right" className="py-2">{r.total_leads || 0}</td>
                <td align="right" className="py-2">{r.jobs_sold || 0}</td>
                <td align="right" className="py-2">
                  {r.close_rate_pct != null ? `${r.close_rate_pct.toFixed(1)}%` : "—"}
                </td>
                <td align="right" className="py-2">
                  ${formatNumber(r.total_revenue || 0)}
                </td>
                <td align="right" className="py-2">
                  ${formatNumber(r.total_gross_profit || 0)}
                </td>
                <td align="right" className="py-2">
                  ${formatNumber(r.channel_cost_estimate || 0)}
                </td>
                <td align="right" className="py-2">
                  {r.roi_pct == null ? "—" : `${r.roi_pct.toFixed(1)}%`}
                </td>
                <td align="right" className={`py-2 ${getRecommendationColor(r.recommendation)}`}>
                  {getRecommendationLabel(r.recommendation)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function BudgetShiftPanel({ shifts }: { shifts: BudgetShift[] }) {
  if (!shifts || shifts.length === 0) {
    return (
      <div className="rounded-xl border bg-white p-4 shadow-sm">
        <h2 className="font-semibold mb-3">Suggested Budget Reallocation</h2>
        <div className="text-sm text-gray-400">No budget shift recommendations available.</div>
      </div>
    );
  }

  const reduces = shifts.filter((s) => s.suggested_reduce > 0);
  const increases = shifts.filter((s) => s.suggested_increase > 0);

  const totalReduce = reduces.reduce((sum, s) => sum + (s.suggested_reduce || 0), 0);
  const totalIncrease = increases.reduce((sum, s) => sum + (s.suggested_increase || 0), 0);
  const netChange = totalIncrease - totalReduce;

  return (
    <div className="rounded-xl border bg-white p-4 shadow-sm">
      <h2 className="font-semibold mb-3">Suggested Budget Reallocation</h2>
      <p className="text-xs text-gray-500 mb-4">
        SmartSend recommends shifting budget from low-ROI channels to high-ROI channels.
      </p>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-4">
        <div>
          <h3 className="text-sm font-bold text-red-600 mb-2">
            Reduce Spend ({reduces.length} channels)
          </h3>
          {reduces.length === 0 ? (
            <div className="text-xs text-gray-500">No reductions recommended.</div>
          ) : (
            <ul className="space-y-2">
              {reduces.map((s) => (
                <li key={s.lead_source_id} className="flex justify-between items-center text-sm border-b pb-2">
                  <div>
                    <div className="font-medium">{s.lead_source_name}</div>
                    <div className="text-xs text-gray-500">
                      Current: ${formatNumber(s.current_budget || 0)}
                      {s.roi_pct != null && ` • ROI: ${s.roi_pct.toFixed(1)}%`}
                    </div>
                  </div>
                  <span className="text-red-600 font-semibold">
                    -${formatNumber(s.suggested_reduce)}
                  </span>
                </li>
              ))}
            </ul>
          )}
          {reduces.length > 0 && (
            <div className="mt-3 pt-2 border-t">
              <div className="flex justify-between text-sm font-semibold">
                <span>Total Reduction:</span>
                <span className="text-red-600">-${formatNumber(totalReduce)}</span>
              </div>
            </div>
          )}
        </div>

        <div>
          <h3 className="text-sm font-bold text-green-600 mb-2">
            Increase Spend ({increases.length} channels)
          </h3>
          {increases.length === 0 ? (
            <div className="text-xs text-gray-500">No increases recommended.</div>
          ) : (
            <ul className="space-y-2">
              {increases.map((s) => (
                <li key={s.lead_source_id} className="flex justify-between items-center text-sm border-b pb-2">
                  <div>
                    <div className="font-medium">{s.lead_source_name}</div>
                    <div className="text-xs text-gray-500">
                      Current: ${formatNumber(s.current_budget || 0)}
                      {s.roi_pct != null && ` • ROI: ${s.roi_pct.toFixed(1)}%`}
                    </div>
                  </div>
                  <span className="text-green-600 font-semibold">
                    +${formatNumber(s.suggested_increase)}
                  </span>
                </li>
              ))}
            </ul>
          )}
          {increases.length > 0 && (
            <div className="mt-3 pt-2 border-t">
              <div className="flex justify-between text-sm font-semibold">
                <span>Total Increase:</span>
                <span className="text-green-600">+${formatNumber(totalIncrease)}</span>
              </div>
            </div>
          )}
        </div>
      </div>

      {reduces.length > 0 || increases.length > 0 ? (
        <div className="mt-4 pt-4 border-t bg-gray-50 rounded-lg p-3">
          <div className="flex justify-between items-center">
            <span className="text-sm font-semibold">Net Budget Change:</span>
            <span className={`text-lg font-bold ${netChange >= 0 ? "text-green-600" : "text-red-600"}`}>
              {netChange >= 0 ? "+" : ""}${formatNumber(Math.abs(netChange))}
            </span>
          </div>
          <p className="text-xs text-gray-500 mt-1">
            {netChange >= 0
              ? "This reallocation increases your marketing budget efficiency."
              : "This reallocation reduces your marketing spend while improving ROI."}
          </p>
        </div>
      ) : null}
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



































