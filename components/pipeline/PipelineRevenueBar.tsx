"use client";

import { useEffect, useState } from "react";
import useSWR from "swr";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

export function PipelineRevenueBar() {
  const { data, error, isLoading } = useSWR("/api/pipeline/revenue", fetcher, {
    refreshInterval: 30000, // Refresh every 30 seconds
  });

  if (isLoading) {
    return (
      <div className="rounded-2xl border border-zinc-800 bg-zinc-900/40 p-4">
        <div className="text-sm text-zinc-400">Loading revenue data...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-2xl border border-zinc-800 bg-zinc-900/40 p-4">
        <div className="text-sm text-red-400">Failed to load revenue data</div>
      </div>
    );
  }

  const summary = data || {
    leads_count: 0,
    inspections_count: 0,
    estimates_count: 0,
    total_estimate_value: 0,
    jobs_won_count: 0,
    revenue_won: 0,
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount);
  };

  return (
    <div className="rounded-2xl border border-zinc-800 bg-zinc-900/40 p-6">
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        {/* Leads */}
        <div className="text-center">
          <div className="text-2xl font-bold text-zinc-100">
            {summary.leads_count || 0}
          </div>
          <div className="text-xs text-zinc-400 mt-1">Leads</div>
        </div>

        {/* Inspections Scheduled */}
        <div className="text-center">
          <div className="text-2xl font-bold text-blue-400">
            {summary.inspections_count || 0}
          </div>
          <div className="text-xs text-zinc-400 mt-1">Inspections</div>
        </div>

        {/* Total Estimate Value */}
        <div className="text-center">
          <div className="text-2xl font-bold text-amber-400">
            {formatCurrency(summary.total_estimate_value || 0)}
          </div>
          <div className="text-xs text-zinc-400 mt-1">Estimate Value</div>
        </div>

        {/* Jobs Won */}
        <div className="text-center">
          <div className="text-2xl font-bold text-purple-400">
            {summary.jobs_won_count || 0}
          </div>
          <div className="text-xs text-zinc-400 mt-1">Jobs Won</div>
        </div>

        {/* Revenue Won */}
        <div className="text-center">
          <div className="text-2xl font-bold text-emerald-400">
            {formatCurrency(summary.revenue_won || 0)}
          </div>
          <div className="text-xs text-zinc-400 mt-1">Revenue Won</div>
        </div>
      </div>
    </div>
  );
}




























































