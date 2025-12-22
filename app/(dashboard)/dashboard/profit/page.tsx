// Block 25340 — SmartSend Roofing Job Costing & Profit Engine v1
// Owner-Only Profit Dashboard

"use client";

import { useEffect, useState } from "react";
import useSWR from "swr";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

interface ProfitDashboardData {
  top_profitable_jobs: any[];
  least_profitable_jobs: any[];
  crew_efficiency: any[];
  supplier_cost_accuracy: any[];
  insurance_vs_retail: any[];
  average_margin: number;
  projected_revenue: number;
  actual_revenue: number;
  revenue_variance: number;
  revenue_variance_pct: number;
}

export default function ProfitDashboardPage() {
  const [days, setDays] = useState(30);
  const { data, error, mutate } = useSWR<ProfitDashboardData>(
    `/api/dashboard/profit?days=${days}`,
    fetcher,
    { refreshInterval: 60000 }
  );

  if (error) {
    return (
      <div className="p-6">
        <div className="text-red-400">Error loading profit dashboard: {error.message}</div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="p-6">
        <div className="text-zinc-400">Loading profit dashboard...</div>
      </div>
    );
  }

  const {
    top_profitable_jobs,
    least_profitable_jobs,
    crew_efficiency,
    supplier_cost_accuracy,
    insurance_vs_retail,
    average_margin,
    projected_revenue,
    actual_revenue,
    revenue_variance,
    revenue_variance_pct,
  } = data;

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-zinc-100">Profit Dashboard</h1>
          <p className="text-sm text-zinc-400 mt-1">
            Real-time profit intelligence for your roofing business
          </p>
        </div>
        <select
          value={days}
          onChange={(e) => setDays(parseInt(e.target.value))}
          className="px-3 py-1.5 bg-zinc-800 border border-zinc-700 rounded text-sm text-zinc-200"
        >
          <option value={7}>Last 7 days</option>
          <option value={30}>Last 30 days</option>
          <option value={90}>Last 90 days</option>
        </select>
      </div>

      {/* Key Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="p-4 bg-zinc-900 rounded-lg border border-zinc-800">
          <div className="text-xs text-zinc-400 mb-1">Average Margin</div>
          <div className={`text-2xl font-bold ${
            average_margin >= 35 ? "text-emerald-400" :
            average_margin >= 30 ? "text-amber-400" :
            "text-red-400"
          }`}>
            {average_margin.toFixed(1)}%
          </div>
        </div>
        <div className="p-4 bg-zinc-900 rounded-lg border border-zinc-800">
          <div className="text-xs text-zinc-400 mb-1">Projected Revenue</div>
          <div className="text-2xl font-bold text-zinc-200">
            ${projected_revenue.toLocaleString()}
          </div>
        </div>
        <div className="p-4 bg-zinc-900 rounded-lg border border-zinc-800">
          <div className="text-xs text-zinc-400 mb-1">Actual Revenue</div>
          <div className="text-2xl font-bold text-zinc-200">
            ${actual_revenue.toLocaleString()}
          </div>
        </div>
        <div className="p-4 bg-zinc-900 rounded-lg border border-zinc-800">
          <div className="text-xs text-zinc-400 mb-1">Revenue Variance</div>
          <div className={`text-2xl font-bold ${
            revenue_variance >= 0 ? "text-emerald-400" : "text-red-400"
          }`}>
            {revenue_variance >= 0 ? "+" : ""}${revenue_variance.toLocaleString()}
          </div>
          <div className="text-xs text-zinc-500 mt-1">
            ({revenue_variance_pct >= 0 ? "+" : ""}{revenue_variance_pct.toFixed(1)}%)
          </div>
        </div>
      </div>

      {/* Insurance vs Retail Comparison */}
      {insurance_vs_retail.length > 0 && (
        <div className="p-4 bg-zinc-900 rounded-lg border border-zinc-800">
          <h2 className="text-lg font-semibold text-zinc-200 mb-4">Insurance vs Retail Profitability</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {insurance_vs_retail.map((item: any) => (
              <div key={item.job_revenue_type} className="p-3 bg-zinc-950 rounded border border-zinc-800">
                <div className="text-sm font-medium text-zinc-300 mb-2">
                  {item.job_revenue_type === "insurance" ? "Insurance Jobs" : "Retail Jobs"}
                </div>
                <div className="space-y-1 text-xs">
                  <div className="flex justify-between">
                    <span className="text-zinc-400">Jobs</span>
                    <span className="text-zinc-200">{item.job_count}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-zinc-400">Avg Margin</span>
                    <span className={`font-semibold ${
                      item.avg_margin_pct >= 35 ? "text-emerald-400" :
                      item.avg_margin_pct >= 30 ? "text-amber-400" :
                      "text-red-400"
                    }`}>
                      {item.avg_margin_pct?.toFixed(1)}%
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-zinc-400">Avg Profit</span>
                    <span className="text-zinc-200">${item.avg_profit?.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-zinc-400">Total Profit</span>
                    <span className="text-zinc-200">${item.total_profit?.toFixed(2)}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Top 10 Most Profitable Jobs */}
      <div className="p-4 bg-zinc-900 rounded-lg border border-zinc-800">
        <h2 className="text-lg font-semibold text-zinc-200 mb-4">Top 10 Most Profitable Jobs</h2>
        <div className="space-y-2">
          {top_profitable_jobs.length > 0 ? (
            top_profitable_jobs.map((job: any) => (
              <div key={job.id} className="p-3 bg-zinc-950 rounded border border-zinc-800">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="text-sm font-medium text-zinc-200">{job.title || "Untitled Job"}</div>
                    <div className="text-xs text-zinc-400 mt-1">
                      {job.job_revenue_type && (
                        <span className="capitalize">{job.job_revenue_type} • </span>
                      )}
                      {job.scheduled_start_date && new Date(job.scheduled_start_date).toLocaleDateString()}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-sm font-semibold text-emerald-400">
                      ${job.actual_gross_profit?.toFixed(2) || "0.00"}
                    </div>
                    <div className="text-xs text-zinc-400">
                      {job.actual_margin_pct?.toFixed(1)}% margin
                    </div>
                  </div>
                </div>
              </div>
            ))
          ) : (
            <div className="text-sm text-zinc-500 text-center py-4">No profitable jobs found</div>
          )}
        </div>
      </div>

      {/* Top 10 Least Profitable Jobs */}
      <div className="p-4 bg-zinc-900 rounded-lg border border-zinc-800">
        <h2 className="text-lg font-semibold text-zinc-200 mb-4">Top 10 Least Profitable Jobs</h2>
        <div className="space-y-2">
          {least_profitable_jobs.length > 0 ? (
            least_profitable_jobs.map((job: any) => (
              <div key={job.id} className="p-3 bg-zinc-950 rounded border border-zinc-800">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="text-sm font-medium text-zinc-200">{job.title || "Untitled Job"}</div>
                    <div className="text-xs text-zinc-400 mt-1">
                      {job.job_revenue_type && (
                        <span className="capitalize">{job.job_revenue_type} • </span>
                      )}
                      {job.scheduled_start_date && new Date(job.scheduled_start_date).toLocaleDateString()}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className={`text-sm font-semibold ${
                      job.actual_gross_profit < 0 ? "text-red-400" : "text-amber-400"
                    }`}>
                      ${job.actual_gross_profit?.toFixed(2) || "0.00"}
                    </div>
                    <div className="text-xs text-zinc-400">
                      {job.actual_margin_pct?.toFixed(1)}% margin
                    </div>
                  </div>
                </div>
              </div>
            ))
          ) : (
            <div className="text-sm text-zinc-500 text-center py-4">No jobs found</div>
          )}
        </div>
      </div>

      {/* Crew Efficiency */}
      {crew_efficiency && crew_efficiency.length > 0 && (
        <div className="p-4 bg-zinc-900 rounded-lg border border-zinc-800">
          <h2 className="text-lg font-semibold text-zinc-200 mb-4">Crew Cost Efficiency</h2>
          <div className="space-y-2">
            {crew_efficiency.map((crew: any, idx: number) => (
              <div key={idx} className="p-3 bg-zinc-950 rounded border border-zinc-800">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="text-sm font-medium text-zinc-200">{crew.crew_name || "Unknown Crew"}</div>
                    <div className="text-xs text-zinc-400 mt-1">
                      {crew.job_count} jobs • Avg ${crew.avg_labor_cost_per_job?.toFixed(2)}/job
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-sm font-semibold text-zinc-200">
                      ${crew.avg_profit_per_job?.toFixed(2)}/job
                    </div>
                    <div className="text-xs text-zinc-400">
                      {crew.avg_margin_pct?.toFixed(1)}% avg margin
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Supplier Cost Accuracy */}
      {supplier_cost_accuracy && supplier_cost_accuracy.length > 0 && (
        <div className="p-4 bg-zinc-900 rounded-lg border border-zinc-800">
          <h2 className="text-lg font-semibold text-zinc-200 mb-4">Supplier Cost Accuracy</h2>
          <div className="space-y-2">
            {supplier_cost_accuracy.map((supplier: any, idx: number) => (
              <div key={idx} className="p-3 bg-zinc-950 rounded border border-zinc-800">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="text-sm font-medium text-zinc-200">{supplier.name}</div>
                    <div className="text-xs text-zinc-400 mt-1">
                      {supplier.variance_pcts?.length || 0} orders tracked
                    </div>
                  </div>
                  <div className="text-right">
                    <div className={`text-sm font-semibold ${
                      Math.abs(supplier.avg_variance) <= 5 ? "text-emerald-400" :
                      Math.abs(supplier.avg_variance) <= 10 ? "text-amber-400" :
                      "text-red-400"
                    }`}>
                      {supplier.avg_variance >= 0 ? "+" : ""}{supplier.avg_variance?.toFixed(1)}%
                    </div>
                    <div className="text-xs text-zinc-400">avg variance</div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}




































