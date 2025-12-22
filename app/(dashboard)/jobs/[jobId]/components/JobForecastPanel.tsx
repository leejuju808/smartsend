// Block 22600 — SmartSend Roofing Job Forecasting & Variance Alerts v1
// Job Forecast Panel Component
// Displays forecast vs budget with status indicators

"use client";

import useSWR from "swr";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

interface ForecastVarianceData {
  job_id: string;
  revenue: number;
  actual_costs: {
    material: number;
    labor: number;
  };
  forecast: {
    material: number;
    labor: number;
    total_cost: number;
    profit: number;
    margin: number;
  };
  budget: {
    material: number;
    labor: number;
    total_cost: number;
    profit: number;
    margin: number;
  };
  profit_variance: number;
  profit_variance_percent: number;
}

export function JobForecastPanel({ jobId }: { jobId: string }) {
  const { data, error, mutate } = useSWR<ForecastVarianceData>(
    `/api/jobs/${jobId}/forecast-variance`,
    fetcher,
    {
      refreshInterval: 30000, // Refresh every 30 seconds
    }
  );

  if (!data && !error) {
    return (
      <div className="rounded-2xl border border-zinc-800 bg-zinc-950 p-4">
        <p className="text-xs text-zinc-400">Loading forecast data…</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-2xl border border-zinc-800 bg-zinc-950 p-4">
        <p className="text-xs text-red-400">
          Error: {error instanceof Error ? error.message : "Failed to load forecast data"}
        </p>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="rounded-2xl border border-zinc-800 bg-zinc-950 p-4">
        <p className="text-xs text-red-400">No forecast data available</p>
      </div>
    );
  }

  const { budget, forecast, profit_variance, profit_variance_percent } = data;

  // Determine status
  let status = "On Track";
  let statusClass = "text-green-600";
  let statusBg = "bg-green-600/10";
  
  if (forecast.margin < budget.margin - 5) {
    status = "At Risk";
    statusClass = "text-yellow-600";
    statusBg = "bg-yellow-600/10";
  }
  
  if (forecast.margin < 25) {
    status = "Critical";
    statusClass = "text-red-600";
    statusBg = "bg-red-600/10";
  }

  return (
    <div className="rounded-2xl border border-zinc-800 bg-zinc-950 p-5 flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
          Forecast vs Budget
        </h3>
        <span className={`text-xs font-semibold px-2 py-1 rounded ${statusClass} ${statusBg}`}>
          {status}
        </span>
      </div>

      <div className="grid grid-cols-2 gap-3 text-sm">
        <div>
          <div className="text-xs text-zinc-500 mb-1">Budget Profit</div>
          <div className="font-medium text-zinc-50">
            ${budget.profit.toFixed(2)} ({budget.margin.toFixed(1)}%)
          </div>
        </div>
        <div>
          <div className="text-xs text-zinc-500 mb-1">Forecast Profit</div>
          <div className={`font-medium ${profit_variance < 0 ? "text-red-400" : "text-green-400"}`}>
            ${forecast.profit.toFixed(2)} ({forecast.margin.toFixed(1)}%)
          </div>
        </div>
      </div>

      <div className="text-sm border-t border-zinc-800 pt-3">
        <div className="flex justify-between items-center">
          <span className="text-zinc-400">Variance</span>
          <span className={profit_variance < 0 ? "text-red-400 font-semibold" : "text-green-400 font-semibold"}>
            ${profit_variance.toFixed(2)} ({profit_variance_percent.toFixed(1)}%)
          </span>
        </div>
      </div>

      {/* Cost Breakdown */}
      <div className="space-y-2 text-xs border-t border-zinc-800 pt-3">
        <div className="flex justify-between">
          <span className="text-zinc-500">Material Cost</span>
          <div className="text-right">
            <div className="text-zinc-400">Budget: ${budget.material.toFixed(2)}</div>
            <div className={forecast.material > budget.material * 1.1 ? "text-red-400" : "text-zinc-50"}>
              Forecast: ${forecast.material.toFixed(2)}
            </div>
          </div>
        </div>
        <div className="flex justify-between">
          <span className="text-zinc-500">Labor Cost</span>
          <div className="text-right">
            <div className="text-zinc-400">Budget: ${budget.labor.toFixed(2)}</div>
            <div className={forecast.labor > budget.labor * 1.1 ? "text-red-400" : "text-zinc-50"}>
              Forecast: ${forecast.labor.toFixed(2)}
            </div>
          </div>
        </div>
      </div>

      {/* Info text */}
      <p className="text-[10px] text-zinc-500 mt-2">
        Forecast based on current progress. Update job progress % to improve accuracy.
      </p>
    </div>
  );
}







































