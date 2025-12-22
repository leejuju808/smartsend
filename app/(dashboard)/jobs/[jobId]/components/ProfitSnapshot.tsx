// Block 22560 — SmartSend Roofing Job Profit Snapshot v1
// Profit Snapshot Component
// Displays revenue, costs, profit, margin, and warnings for a single job

"use client";

import useSWR from "swr";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

interface ProfitSnapshotData {
  job_id: string;
  revenue: number;
  costs: {
    material: number;
    labor: number;
  };
  profit: number;
  margin: number;
  warnings: string[];
  breakdown: {
    contract: number;
    supplement: number;
    change_orders: number;
    pending_change_orders: number;
  };
}

export function ProfitSnapshot({ jobId }: { jobId: string }) {
  const { data, error, mutate } = useSWR<ProfitSnapshotData>(
    `/api/jobs/${jobId}/profit-snapshot`,
    fetcher,
    {
      refreshInterval: 30000, // Refresh every 30 seconds
    }
  );

  if (!data && !error) {
    return (
      <div className="rounded-2xl border border-zinc-800 bg-zinc-950 p-4">
        <p className="text-xs text-zinc-400">Loading profit snapshot…</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-2xl border border-zinc-800 bg-zinc-950 p-4">
        <p className="text-xs text-red-400">
          Error: {error instanceof Error ? error.message : "Failed to load profit snapshot"}
        </p>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="rounded-2xl border border-zinc-800 bg-zinc-950 p-4">
        <p className="text-xs text-red-400">No profit data available</p>
      </div>
    );
  }

  const { revenue, costs, profit, margin, warnings, breakdown } = data;

  const marginColor =
    margin >= 35
      ? "text-emerald-400"
      : margin >= 30
      ? "text-amber-400"
      : "text-red-400";

  const profitColor = profit >= 0 ? "text-emerald-400" : "text-red-400";

  return (
    <div className="rounded-2xl border border-zinc-800 bg-zinc-950 p-5 flex flex-col gap-4">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
        Profit Snapshot
      </h3>

      {/* Revenue */}
      <div className="flex justify-between text-sm">
        <span className="text-zinc-400">Revenue</span>
        <span className="font-medium text-zinc-50">${revenue.toFixed(2)}</span>
      </div>

      {/* Revenue Breakdown (if applicable) */}
      {(breakdown.change_orders > 0 || breakdown.supplement > 0) && (
        <div className="pl-4 space-y-1 text-xs text-zinc-500">
          {breakdown.contract > 0 && (
            <div className="flex justify-between">
              <span>Contract</span>
              <span>${breakdown.contract.toFixed(2)}</span>
            </div>
          )}
          {breakdown.supplement > 0 && (
            <div className="flex justify-between">
              <span>Supplement</span>
              <span>${breakdown.supplement.toFixed(2)}</span>
            </div>
          )}
          {breakdown.change_orders > 0 && (
            <div className="flex justify-between">
              <span>Change Orders</span>
              <span>${breakdown.change_orders.toFixed(2)}</span>
            </div>
          )}
        </div>
      )}

      {/* Costs */}
      <div className="space-y-2 text-sm border-t border-zinc-800 pt-3">
        <div className="flex justify-between">
          <span className="text-zinc-400">Material Cost</span>
          <span className="font-medium text-zinc-50">${costs.material.toFixed(2)}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-zinc-400">Labor Cost</span>
          <span className="font-medium text-zinc-50">${costs.labor.toFixed(2)}</span>
        </div>
      </div>

      {/* Profit */}
      <div className="flex justify-between text-sm border-t border-zinc-800 pt-3">
        <span className="font-semibold text-zinc-50">Profit</span>
        <span className={`font-semibold ${profitColor}`}>
          ${profit.toFixed(2)}
        </span>
      </div>

      {/* Margin */}
      <div className="text-sm border-t border-zinc-800 pt-3">
        <div className="flex justify-between items-center">
          <span className="text-zinc-400">Margin</span>
          <span className={`font-semibold text-lg ${marginColor}`}>
            {margin.toFixed(1)}%
          </span>
        </div>
      </div>

      {/* Warnings */}
      {warnings.length > 0 && (
        <div className="mt-2 space-y-1 border-t border-zinc-800 pt-3">
          {warnings.map((warning, i) => (
            <p key={i} className="text-xs text-red-400 flex items-start gap-1">
              <span>⚠️</span>
              <span>{warning}</span>
            </p>
          ))}
        </div>
      )}

      {/* Info text */}
      <p className="text-[10px] text-zinc-500 mt-2">
        This snapshot updates automatically as costs and revenue are recorded.
      </p>
    </div>
  );
}







































