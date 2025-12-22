// Block 24260 — SmartSend Roofing Pipeline Metrics Component
// Displays dashboard metrics above the pipeline board

"use client";

import useSWR from "swr";
import clsx from "clsx";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

type PipelineMetrics = {
  leads_in_count: number;
  inspections_set_count: number;
  quotes_sent_count: number;
  approved_count: number;
  scheduled_count: number;
  installed_count: number;
  total_leads: number;
  total_estimated_revenue: number;
  revenue_won_this_month: number;
  hot_leads_count: number;
  warm_leads_count: number;
  cold_leads_count: number;
};

export function RoofingPipelineMetrics() {
  const { data, error, isLoading } = useSWR<PipelineMetrics>(
    "/api/pipeline/roofing/metrics",
    fetcher,
    {
      refreshInterval: 30000,
    }
  );

  if (isLoading) {
    return (
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-4 mb-6">
        {[...Array(7)].map((_, i) => (
          <div
            key={i}
            className="rounded-lg border border-zinc-800 bg-zinc-900/40 p-4 h-24 animate-pulse"
          />
        ))}
      </div>
    );
  }

  if (error || !data) {
    return null;
  }

  const formatCurrency = (value: number) => {
    if (value >= 1000000) {
      return `$${(value / 1000000).toFixed(2)}M`;
    }
    if (value >= 1000) {
      return `$${(value / 1000).toFixed(1)}k`;
    }
    return `$${value.toFixed(0)}`;
  };

  const metrics = [
    {
      label: "Leads In",
      value: data.leads_in_count,
      color: "text-gray-400",
      bgColor: "bg-gray-500/10",
    },
    {
      label: "Inspections Set",
      value: data.inspections_set_count,
      color: "text-blue-400",
      bgColor: "bg-blue-500/10",
    },
    {
      label: "Quotes Sent",
      value: data.quotes_sent_count,
      color: "text-amber-400",
      bgColor: "bg-amber-500/10",
    },
    {
      label: "Approved",
      value: data.approved_count,
      color: "text-green-400",
      bgColor: "bg-green-500/10",
    },
    {
      label: "Scheduled",
      value: data.scheduled_count,
      color: "text-purple-400",
      bgColor: "bg-purple-500/10",
    },
    {
      label: "Installed",
      value: data.installed_count,
      color: "text-emerald-400",
      bgColor: "bg-emerald-500/10",
    },
    {
      label: "Total Revenue",
      value: formatCurrency(data.total_estimated_revenue),
      color: "text-yellow-400",
      bgColor: "bg-yellow-500/10",
      isCurrency: true,
    },
  ];

  return (
    <div className="rounded-2xl border border-zinc-800 bg-zinc-900/40 p-6 mb-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold text-white">Pipeline Overview</h2>
        <div className="flex items-center gap-4 text-sm">
          <div className="flex items-center gap-2">
            <span className="w-3 h-3 rounded-full bg-red-500"></span>
            <span className="text-zinc-400">{data.hot_leads_count} HOT</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-3 h-3 rounded-full bg-yellow-500"></span>
            <span className="text-zinc-400">{data.warm_leads_count} WARM</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-3 h-3 rounded-full bg-gray-500"></span>
            <span className="text-zinc-400">{data.cold_leads_count} COLD</span>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-4">
        {metrics.map((metric, idx) => (
          <div
            key={idx}
            className={clsx(
              "rounded-lg border p-4",
              metric.bgColor,
              "border-zinc-800"
            )}
          >
            <div className="text-xs text-zinc-500 mb-1">{metric.label}</div>
            <div className={clsx("text-2xl font-bold", metric.color)}>
              {metric.value}
            </div>
          </div>
        ))}
      </div>

      {data.revenue_won_this_month > 0 && (
        <div className="mt-4 pt-4 border-t border-zinc-800">
          <div className="flex items-center justify-between">
            <span className="text-sm text-zinc-400">Revenue Won This Month</span>
            <span className="text-lg font-semibold text-emerald-400">
              {formatCurrency(data.revenue_won_this_month)}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}






































