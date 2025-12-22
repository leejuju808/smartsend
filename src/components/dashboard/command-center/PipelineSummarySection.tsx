// Section 5 — Pipeline Summary

"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { BarChart3, DollarSign, AlertCircle } from "lucide-react";

interface PipelineSummarySectionProps {
  summary: {
    counts: Record<string, number>;
    weighted_value: number;
    best_case_value: number;
    jobs_stuck_48h: number;
  };
}

export function PipelineSummarySection({ summary }: PipelineSummarySectionProps) {
  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount);
  };

  const formatStatus = (status: string) => {
    return status
      .split("_")
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(" ");
  };

  return (
    <div>
      <h2 className="text-2xl font-bold mb-4 text-white">Pipeline Summary</h2>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Pipeline Counts */}
        <Card className="bg-gray-900 border-gray-800">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-white">
              <BarChart3 className="h-5 w-5 text-blue-500" />
              Pipeline Stages
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {Object.entries(summary.counts).map(([status, count]) => (
                <div key={status} className="flex items-center justify-between p-2 rounded bg-gray-800">
                  <span className="text-gray-300 text-sm">{formatStatus(status)}</span>
                  <span className="text-white font-bold">{count}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Pipeline Value */}
        <Card className="bg-gray-900 border-gray-800">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-white">
              <DollarSign className="h-5 w-5 text-green-500" />
              Pipeline Value
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <div className="text-sm text-gray-400 mb-1">Weighted Value</div>
              <div className="text-2xl font-bold text-white">
                {formatCurrency(summary.weighted_value)}
              </div>
            </div>
            <div>
              <div className="text-sm text-gray-400 mb-1">Best-Case Value</div>
              <div className="text-2xl font-bold text-green-400">
                {formatCurrency(summary.best_case_value)}
              </div>
            </div>
            {summary.jobs_stuck_48h > 0 && (
              <div className="flex items-center gap-2 p-3 rounded bg-yellow-500/10 border border-yellow-500/20">
                <AlertCircle className="h-4 w-4 text-yellow-500" />
                <span className="text-sm text-yellow-400">
                  {summary.jobs_stuck_48h} jobs stuck 48+ hours
                </span>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}









































