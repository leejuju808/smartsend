// Block 27580 — SmartSend Roofing Owner Command Center v1
// "The single most important page in SmartSend"
// The page roofing owners will open EVERY morning

"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { 
  TrendingUp, 
  TrendingDown, 
  DollarSign, 
  AlertTriangle, 
  Users, 
  Calendar,
  Target,
  Brain,
  Phone,
  Mail
} from "lucide-react";

interface CommandCenterSummary {
  total_projected_profit: number;
  total_projected_revenue: number;
  forecast_30: number;
  forecast_60: number;
  forecast_90: number;
  total_overdue: number;
  overdue_requests: number;
  high_risk_overdue_count: number;
  pipeline_leads: number;
  pipeline_expected_value: number;
  next_30_squares: number;
  next_30_capacity: number;
  profitable_marketing_revenue: number;
  smartsend_cold_revenue: number;
}

interface Collection {
  payment_request_id: string;
  job_id: string;
  job_name: string;
  customer_name: string;
  customer_email: string;
  request_type: string;
  amount: number;
  due_date: string;
  days_overdue: number;
  severity: string;
  recommended_channel: string;
}

interface PipelineDeal {
  job_id: string;
  homeowner_name: string;
  address: string;
  status: string;
  estimated_value: number;
  win_probability: number;
  expected_revenue: number;
  expected_profit: number;
  follow_up_priority: string;
}

interface CapacityWeek {
  workspace_id: string;
  week_start: string;
  jobs_count: number;
  total_squares: number;
  weekly_capacity_squares: number;
  capacity_ratio: number | null;
}

interface CommandCenterData {
  summary: CommandCenterSummary;
  collections: Collection[];
  pipeline: PipelineDeal[];
  capacity: CapacityWeek[];
}

export default function OwnerCommandCenter() {
  const [data, setData] = useState<CommandCenterData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/owner/command-center")
      .then((r) => {
        if (!r.ok) {
          throw new Error("Failed to fetch command center data");
        }
        return r.json();
      })
      .then((d) => {
        setData(d);
        setLoading(false);
      })
      .catch((err) => {
        console.error("Error loading command center:", err);
        setError(err.message);
        setLoading(false);
      });
  }, []);

  if (loading) {
    return (
      <div className="p-6">
        <div className="text-center py-12">
          <div className="text-sm text-gray-500">Loading Command Center...</div>
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="p-6">
        <div className="text-center py-12">
          <div className="text-sm text-red-600">
            Error loading command center: {error || "Unknown error"}
          </div>
        </div>
      </div>
    );
  }

  const { summary, collections, pipeline, capacity } = data;

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Owner Command Center</h1>
        <p className="text-sm text-gray-500 mt-1">
          Everything you need to run your roofing company — in one page.
        </p>
      </div>

      {/* TOP SUMMARY — 3 KEY METRICS */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <StatCard 
          label="Projected Profit (All Jobs)" 
          value={`$${Number(summary.total_projected_profit || 0).toLocaleString()}`}
          icon={<TrendingUp className="w-5 h-5" />}
        />
        <StatCard 
          label="Next 30 Days Revenue" 
          value={`$${Number(summary.forecast_30 || 0).toLocaleString()}`}
          icon={<Target className="w-5 h-5" />}
        />
        <StatCard 
          label="Total Overdue Invoices" 
          value={`$${Number(summary.total_overdue || 0).toLocaleString()}`}
          danger={Number(summary.total_overdue || 0) > 0}
          icon={<AlertTriangle className="w-5 h-5" />}
        />
      </div>

      {/* PIPELINE & COLLECTIONS */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <PipelineCard pipeline={pipeline} total={summary.pipeline_expected_value} />
        <CollectionsCard collections={collections} total={summary.total_overdue} />
      </div>

      {/* FORECAST RADAR */}
      <ForecastRadarCard 
        forecast30={summary.forecast_30}
        forecast60={summary.forecast_60}
        forecast90={summary.forecast_90}
      />

      {/* CAPACITY FORECAST */}
      <CapacityCard capacity={capacity} />

      {/* MARKETING ROI */}
      <MarketingCard
        cold={summary.smartsend_cold_revenue}
        profitable={summary.profitable_marketing_revenue}
      />

      {/* AI SUMMARY (Optional) */}
      <AISummaryCard summary={summary} collections={collections} pipeline={pipeline} capacity={capacity} />
    </div>
  );
}

function StatCard({ label, value, danger, icon }: { 
  label: string; 
  value: string; 
  danger?: boolean;
  icon?: React.ReactNode;
}) {
  return (
    <div className={`p-4 rounded-xl border bg-white shadow-sm ${danger ? "border-red-400" : "border-gray-200"}`}>
      <div className="flex items-center justify-between mb-2">
        <div className="text-xs text-gray-500">{label}</div>
        {icon && <div className={danger ? "text-red-600" : "text-gray-400"}>{icon}</div>}
      </div>
      <div className={`text-xl font-bold ${danger ? "text-red-600" : "text-gray-900"}`}>
        {value}
      </div>
    </div>
  );
}

function PipelineCard({ pipeline, total }: { pipeline: PipelineDeal[]; total: number }) {
  return (
    <div className="p-4 rounded-xl border bg-white shadow-sm border-gray-200">
      <div className="flex items-center gap-2 mb-3">
        <Target className="w-4 h-4 text-gray-400" />
        <h2 className="font-bold text-sm">Pipeline Health</h2>
      </div>
      <div className="text-xs text-gray-500 mb-3">
        Expected Value: <b className="text-gray-900">${Number(total || 0).toLocaleString()}</b>
      </div>
      <ul className="space-y-2 text-xs">
        {pipeline.length > 0 ? (
          pipeline.map((d) => (
            <li key={d.job_id} className="flex justify-between items-center border-b pb-2 last:border-0">
              <div className="flex-1 min-w-0">
                <div className="font-medium text-gray-900 truncate">
                  {d.homeowner_name || d.address || "Untitled Deal"}
                </div>
                <div className="text-gray-500 text-[10px] mt-0.5">
                  ${Number(d.estimated_value || 0).toLocaleString()}
                </div>
              </div>
              <div className="ml-3 text-right">
                <div className={`font-semibold ${d.win_probability >= 70 ? "text-green-600" : d.win_probability >= 50 ? "text-yellow-600" : "text-gray-600"}`}>
                  {Number(d.win_probability || 0).toFixed(0)}%
                </div>
                <div className="text-[10px] text-gray-400">win prob</div>
              </div>
            </li>
          ))
        ) : (
          <li className="text-gray-400 py-2">No active pipeline deals</li>
        )}
      </ul>
    </div>
  );
}

function CollectionsCard({ collections, total }: { collections: Collection[]; total: number }) {
  return (
    <div className="p-4 rounded-xl border bg-white shadow-sm border-gray-200">
      <div className="flex items-center gap-2 mb-3">
        <DollarSign className="w-4 h-4 text-gray-400" />
        <h2 className="font-bold text-sm">Collections — Who Owes You</h2>
      </div>
      <div className="text-xs text-gray-500 mb-3">
        Total Overdue: <b className="text-gray-900">${Number(total || 0).toLocaleString()}</b>
      </div>
      <ul className="text-xs space-y-2">
        {collections.length > 0 ? (
          collections.map((c) => (
            <li key={c.payment_request_id} className="flex justify-between items-center border-b pb-2 last:border-0">
              <div className="flex-1 min-w-0">
                <div className="font-medium text-gray-900 truncate">
                  {c.customer_name || c.job_name || "Unknown"}
                </div>
                <div className="text-gray-500 text-[10px] mt-0.5">
                  ${Number(c.amount || 0).toLocaleString()}
                </div>
              </div>
              <div className="ml-3 text-right">
                <div className={`font-semibold ${c.severity === 'high' ? "text-red-600" : c.severity === 'medium' ? "text-yellow-600" : "text-gray-600"}`}>
                  {c.days_overdue} days
                </div>
                <div className="text-[10px] text-gray-400">
                  {c.recommended_channel === 'call' ? (
                    <Phone className="w-3 h-3 inline" />
                  ) : (
                    <Mail className="w-3 h-3 inline" />
                  )}
                </div>
              </div>
            </li>
          ))
        ) : (
          <li className="text-gray-400 py-2">No overdue payments</li>
        )}
      </ul>
    </div>
  );
}

function ForecastRadarCard({ forecast30, forecast60, forecast90 }: { 
  forecast30: number; 
  forecast60: number; 
  forecast90: number;
}) {
  return (
    <div className="p-4 rounded-xl border bg-white shadow-sm border-gray-200">
      <div className="flex items-center gap-2 mb-3">
        <TrendingUp className="w-4 h-4 text-gray-400" />
        <h2 className="font-bold text-sm">Revenue Forecast Radar</h2>
      </div>
      <div className="grid grid-cols-3 gap-4">
        <div className="text-center">
          <div className="text-xs text-gray-500 mb-1">30 Days</div>
          <div className="text-lg font-bold text-gray-900">
            ${Number(forecast30 || 0).toLocaleString()}
          </div>
        </div>
        <div className="text-center">
          <div className="text-xs text-gray-500 mb-1">60 Days</div>
          <div className="text-lg font-bold text-gray-900">
            ${Number(forecast60 || 0).toLocaleString()}
          </div>
        </div>
        <div className="text-center">
          <div className="text-xs text-gray-500 mb-1">90 Days</div>
          <div className="text-lg font-bold text-gray-900">
            ${Number(forecast90 || 0).toLocaleString()}
          </div>
        </div>
      </div>
    </div>
  );
}

function CapacityCard({ capacity }: { capacity: CapacityWeek[] }) {
  return (
    <div className="p-4 rounded-xl border bg-white shadow-sm border-gray-200">
      <div className="flex items-center gap-2 mb-3">
        <Calendar className="w-4 h-4 text-gray-400" />
        <h2 className="font-bold text-sm">Install Capacity (Next 4 Weeks)</h2>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="text-gray-500 border-b">
              <th align="left" className="pb-2">Week</th>
              <th align="right" className="pb-2">Squares Scheduled</th>
              <th align="right" className="pb-2">Capacity</th>
              <th align="right" className="pb-2">Load</th>
            </tr>
          </thead>
          <tbody>
            {capacity.length > 0 ? (
              capacity.map((w) => {
                const weekDate = new Date(w.week_start);
                const weekLabel = weekDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
                const loadPercent = w.capacity_ratio ? (w.capacity_ratio * 100) : 0;
                const isOverbooked = loadPercent > 100;
                const isNearCapacity = loadPercent > 85;
                
                return (
                  <tr key={w.week_start} className="border-b last:border-0">
                    <td className="py-2">{weekLabel}</td>
                    <td align="right" className="py-2">{Number(w.total_squares || 0).toLocaleString()}</td>
                    <td align="right" className="py-2">{Number(w.weekly_capacity_squares || 0).toLocaleString()}</td>
                    <td align="right" className={`py-2 font-semibold ${isOverbooked ? "text-red-600" : isNearCapacity ? "text-yellow-600" : "text-gray-600"}`}>
                      {w.capacity_ratio ? `${loadPercent.toFixed(0)}%` : "—"}
                    </td>
                  </tr>
                );
              })
            ) : (
              <tr>
                <td colSpan={4} className="text-center text-gray-400 py-4">
                  No capacity data available
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function MarketingCard({ cold, profitable }: { cold: number; profitable: number }) {
  return (
    <div className="p-4 rounded-xl border bg-white shadow-sm border-gray-200">
      <div className="flex items-center gap-2 mb-3">
        <TrendingUp className="w-4 h-4 text-gray-400" />
        <h2 className="font-bold text-sm">Marketing ROI</h2>
      </div>
      <div className="space-y-2 text-xs">
        <div className="flex justify-between items-center">
          <span className="text-gray-500">SmartSend Cold Email generated:</span>
          <b className="text-gray-900">${Number(cold || 0).toLocaleString()}</b>
        </div>
        <div className="flex justify-between items-center">
          <span className="text-gray-500">Revenue from profitable sources:</span>
          <b className="text-gray-900">${Number(profitable || 0).toLocaleString()}</b>
        </div>
      </div>
    </div>
  );
}

function AISummaryCard({ summary, collections, pipeline, capacity }: {
  summary: CommandCenterSummary;
  collections: Collection[];
  pipeline: PipelineDeal[];
  capacity: CapacityWeek[];
}) {
  // Generate AI summary based on data
  const insights: string[] = [];
  
  // Profit insights
  if (summary.total_projected_profit > 0) {
    const profitMargin = summary.total_projected_revenue > 0 
      ? (summary.total_projected_profit / summary.total_projected_revenue * 100).toFixed(0)
      : "0";
    insights.push(`Profit is ${profitMargin}% of revenue.`);
  }
  
  // Forecast insights
  if (summary.forecast_30 > 0 && summary.forecast_60 > 0) {
    const growth = ((summary.forecast_60 - summary.forecast_30) / summary.forecast_30 * 100).toFixed(0);
    if (Number(growth) < -10) {
      insights.push(`Next month shows a ${Math.abs(Number(growth))}% decline versus current month.`);
    }
  }
  
  // Collections insights
  if (collections.length > 0) {
    const topOverdue = collections.slice(0, 2);
    const names = topOverdue.map(c => c.customer_name || c.job_name).filter(Boolean);
    if (names.length > 0) {
      insights.push(`Overdue payments from ${names.join(" and ")} (${topOverdue.length} accounts) are affecting cashflow.`);
    }
  }
  
  // Pipeline insights
  if (pipeline.length > 0) {
    const highProbDeals = pipeline.filter(d => (d.win_probability || 0) >= 70);
    insights.push(`Pipeline value is $${Number(summary.pipeline_expected_value || 0).toLocaleString()}, with ${highProbDeals.length} deals above 70% close probability.`);
  }
  
  // Capacity insights
  const overbookedWeeks = capacity.filter(w => w.capacity_ratio && w.capacity_ratio > 0.95);
  if (overbookedWeeks.length > 0) {
    const weekDate = new Date(overbookedWeeks[0].week_start);
    insights.push(`Crew load is stable, but ${weekDate.toLocaleDateString('en-US', { month: 'long', day: 'numeric' })} is at ${(overbookedWeeks[0].capacity_ratio! * 100).toFixed(0)}% capacity — avoid overscheduling.`);
  }

  if (insights.length === 0) {
    insights.push("All systems operating normally. No immediate action required.");
  }

  return (
    <div className="p-4 rounded-xl border bg-gradient-to-br from-purple-50 to-blue-50 border-purple-200 shadow-sm">
      <div className="flex items-center gap-2 mb-3">
        <Brain className="w-5 h-5 text-purple-600" />
        <h2 className="font-bold text-sm text-purple-900">SmartSend AI Summary (Today's Briefing)</h2>
      </div>
      <div className="text-sm text-gray-700 space-y-1">
        {insights.map((insight, idx) => (
          <p key={idx}>{insight}</p>
        ))}
      </div>
    </div>
  );
}
