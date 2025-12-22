"use client";

// Block 246000 — Profitability Warning Panel
// AI flags: job likely to exceed budget, material overages, labor delays impacting profit, unexpected change order frequency

import { DollarSign, TrendingDown, AlertTriangle } from "lucide-react";
import Link from "next/link";

interface ProfitRisk {
  id: string;
  type: string;
  severity: string;
  message: string;
  metadata: any;
  created_at: string;
  job_id: string | null;
  jobs?: {
    id: string;
    title: string;
    address: string;
    job_value: number;
  } | null;
}

interface ProfitabilityWarningPanelProps {
  risks: ProfitRisk[];
}

export function ProfitabilityWarningPanel({ risks }: ProfitabilityWarningPanelProps) {
  const activeRisks = risks.filter(r => !r.is_resolved);

  const formatCurrency = (value: number | null) => {
    if (!value) return "$0";
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      minimumFractionDigits: 0,
    }).format(value);
  };

  return (
    <div className="bg-zinc-900/50 rounded-xl border border-zinc-800 p-4">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <DollarSign className="h-5 w-5 text-red-400" />
          <h2 className="text-lg font-semibold text-white">Profitability Warnings</h2>
        </div>
        <div className="text-xs text-zinc-400">
          {activeRisks.length} at-risk jobs
        </div>
      </div>

      <div className="space-y-3">
        {activeRisks.length === 0 ? (
          <div className="text-center text-zinc-500 text-sm py-8">
            <TrendingDown className="h-8 w-8 mx-auto mb-2 text-zinc-600" />
            <div>No profitability risks</div>
            <div className="text-xs mt-1">All jobs are on budget</div>
          </div>
        ) : (
          activeRisks.map((risk) => (
            <div
              key={risk.id}
              className="bg-red-500/10 rounded-lg border border-red-500/30 p-3"
            >
              <div className="flex items-start gap-2">
                <AlertTriangle className="h-5 w-5 text-red-400 flex-shrink-0 mt-0.5" />
                <div className="flex-1 min-w-0">
                  {risk.jobs && (
                    <Link href={`/production/jobs/${risk.jobs.id}`}>
                      <div className="font-medium text-white text-sm hover:text-blue-400 mb-1">
                        {risk.jobs.title || risk.jobs.address}
                      </div>
                    </Link>
                  )}
                  <div className="text-sm text-zinc-200 mb-2">{risk.message}</div>
                  
                  {risk.jobs && (
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-zinc-400">Job Value:</span>
                      <span className="font-semibold text-white">
                        {formatCurrency(risk.jobs.job_value)}
                      </span>
                    </div>
                  )}

                  {risk.metadata?.estimated_overage && (
                    <div className="mt-2 text-xs text-red-400">
                      Estimated overage: {formatCurrency(risk.metadata.estimated_overage)}
                    </div>
                  )}

                  {risk.metadata?.risk_factors && (
                    <div className="mt-2 flex flex-wrap gap-1">
                      {risk.metadata.risk_factors.map((factor: string, idx: number) => (
                        <span
                          key={idx}
                          className="text-xs px-2 py-0.5 rounded bg-red-500/20 text-red-300"
                        >
                          {factor}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

























