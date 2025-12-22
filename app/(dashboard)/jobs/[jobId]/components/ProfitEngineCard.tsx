// Block 26020 — SmartSend Roofing Profit Engine v1
// Profit Engine Card Component
// Real-time profit tracking with margin protection warnings

"use client";

import useSWR from "swr";
import { AlertTriangle, TrendingUp, TrendingDown } from "lucide-react";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

interface ProfitData {
  job_id: string;
  estimated_revenue: number;
  final_revenue: number;
  material_cost: number;
  labor_cost: number;
  supplement_revenue: number;
  gross_profit: number;
  margin: number;
  updated_at: string;
}

function Metric({
  label,
  value,
  emphasize,
  highlight,
}: {
  label: string;
  value: string;
  emphasize?: boolean;
  highlight?: "red" | "green" | "yellow" | null;
}) {
  const color =
    highlight === "red"
      ? "text-red-600 dark:text-red-400 font-bold"
      : highlight === "green"
      ? "text-green-600 dark:text-green-400 font-bold"
      : highlight === "yellow"
      ? "text-yellow-600 dark:text-yellow-400 font-bold"
      : "text-zinc-50";

  return (
    <div>
      <div className="text-xs text-zinc-400 uppercase tracking-wide mb-1">
        {label}
      </div>
      <div
        className={`text-lg ${emphasize ? "font-bold" : "font-semibold"} ${color}`}
      >
        {value}
      </div>
    </div>
  );
}

export function ProfitEngineCard({ jobId }: { jobId: string }) {
  const { data, error, mutate } = useSWR<ProfitData>(
    `/api/jobs/${jobId}/profit`,
    fetcher,
    {
      refreshInterval: 30000, // Refresh every 30 seconds
    }
  );

  if (!data && !error) {
    return (
      <div className="rounded-xl border border-zinc-800 bg-zinc-950 p-4 shadow-sm">
        <p className="text-xs text-zinc-400">Loading profit data…</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-xl border border-zinc-800 bg-zinc-950 p-4 shadow-sm">
        <p className="text-xs text-red-400">
          Error: {error instanceof Error ? error.message : "Failed to load profit data"}
        </p>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="rounded-xl border border-zinc-800 bg-zinc-950 p-4 shadow-sm">
        <p className="text-xs text-zinc-400">No profit data available</p>
      </div>
    );
  }

  const {
    final_revenue,
    estimated_revenue,
    material_cost,
    labor_cost,
    supplement_revenue,
    gross_profit,
    margin,
  } = data;

  const revenue = final_revenue || estimated_revenue || 0;

  // Determine margin highlight color
  const marginHighlight =
    margin < 30
      ? "red"
      : margin >= 45
      ? "green"
      : margin >= 30
      ? "yellow"
      : null;

  // Determine profit highlight color
  const profitHighlight = gross_profit < 0 ? "red" : gross_profit > 0 ? "green" : null;

  // Check for low margin warning
  const showWarning = margin < 30;
  const showCriticalWarning = gross_profit < 0;

  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-950 p-4 shadow-sm">
      <div className="flex items-center justify-between mb-3">
        <h2 className="font-bold text-lg text-zinc-50">Profit Engine</h2>
        {showCriticalWarning && (
          <AlertTriangle className="h-5 w-5 text-red-400" />
        )}
        {showWarning && !showCriticalWarning && (
          <AlertTriangle className="h-5 w-5 text-yellow-400" />
        )}
      </div>

      {/* Critical Warning */}
      {showCriticalWarning && (
        <div className="mb-4 rounded-lg border border-red-500/50 bg-red-500/10 p-3">
          <div className="flex items-start gap-2">
            <AlertTriangle className="h-5 w-5 text-red-400 flex-shrink-0 mt-0.5" />
            <div>
              <p className="font-bold text-red-400 text-sm">
                THIS JOB IS LOSING MONEY — FIX YOUR NUMBERS.
              </p>
              <p className="text-xs text-red-300/80 mt-1">
                Current loss: ${Math.abs(gross_profit).toFixed(2)}. Review all costs immediately.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Low Margin Warning */}
      {showWarning && !showCriticalWarning && (
        <div className="mb-4 rounded-lg border border-yellow-500/50 bg-yellow-500/10 p-3">
          <div className="flex items-start gap-2">
            <AlertTriangle className="h-5 w-5 text-yellow-400 flex-shrink-0 mt-0.5" />
            <div>
              <p className="font-bold text-yellow-400 text-sm">
                Margin Warning: {margin.toFixed(1)}%
              </p>
              <p className="text-xs text-yellow-300/80 mt-1">
                Margin has dropped below 30%. Consider requesting supplement or reviewing costs.
              </p>
            </div>
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 gap-4">
        <Metric
          label="Revenue"
          value={`$${revenue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
        />
        <Metric
          label="Material Cost"
          value={`$${material_cost.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
        />
        <Metric
          label="Labor Cost"
          value={`$${labor_cost.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
        />
        <Metric
          label="Supplements"
          value={`+$${supplement_revenue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
        />
        <Metric
          label="Gross Profit"
          value={`$${gross_profit.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
          emphasize
          highlight={profitHighlight || undefined}
        />
        <Metric
          label="Margin"
          value={`${margin.toFixed(1)}%`}
          highlight={marginHighlight || undefined}
        />
      </div>

      {/* Info footer */}
      <div className="mt-4 pt-3 border-t border-zinc-800">
        <p className="text-[10px] text-zinc-500">
          Updates automatically as costs and revenue change. Margin protection alerts trigger below 30%.
        </p>
      </div>
    </div>
  );
}



































