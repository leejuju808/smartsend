"use client";

import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { JobHealthBadge } from "@/components/JobHealthBadge";
import Link from "next/link";

interface AtRiskJobListProps {
  jobs: Array<{
    id: string;
    name?: string;
    email?: string;
    job_health_score: number;
    momentum_score?: number;
    risk_category: string;
    estimated_job_value?: number;
    status: string;
  }>;
}

export function AtRiskJobList({ jobs }: AtRiskJobListProps) {
  const formatCurrency = (amount?: number) => {
    if (!amount) return "N/A";
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount);
  };

  const getRiskColor = (category: string) => {
    switch (category) {
      case "critical":
        return "text-red-600 bg-red-50 border-red-200";
      case "high":
        return "text-orange-600 bg-orange-50 border-orange-200";
      default:
        return "text-yellow-600 bg-yellow-50 border-yellow-200";
    }
  };

  return (
    <Card className="border-red-200">
      <CardHeader>
        <CardTitle className="text-red-600">🚨 Jobs Requiring Attention TODAY</CardTitle>
        <p className="text-sm text-muted-foreground">
          {jobs.length} job{jobs.length !== 1 ? "s" : ""} need immediate action
        </p>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          {jobs.slice(0, 10).map((job) => {
            const displayName = job.name || job.email || "Unknown";
            return (
              <Link
                key={job.id}
                href={`/dashboard/leads/${job.id}`}
                className="block p-4 rounded-lg border hover:bg-gray-50 transition-colors"
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-2">
                      <span className="font-medium truncate">{displayName}</span>
                      <JobHealthBadge score={job.job_health_score} variant="compact" />
                      <span
                        className={`px-2 py-0.5 rounded text-xs font-medium border ${getRiskColor(
                          job.risk_category
                        )}`}
                      >
                        {job.risk_category.toUpperCase()}
                      </span>
                    </div>
                    <div className="flex items-center gap-4 text-sm text-muted-foreground">
                      {job.estimated_job_value && (
                        <span>Value: {formatCurrency(job.estimated_job_value)}</span>
                      )}
                      {job.momentum_score !== undefined && (
                        <span>Momentum: {job.momentum_score}</span>
                      )}
                    </div>
                  </div>
                </div>
              </Link>
            );
          })}
          {jobs.length > 10 && (
            <div className="text-sm text-muted-foreground text-center pt-2">
              +{jobs.length - 10} more jobs need attention
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

