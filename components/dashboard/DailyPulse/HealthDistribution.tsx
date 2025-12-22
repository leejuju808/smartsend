"use client";

import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";

interface HealthDistributionProps {
  pulse: {
    healthy_jobs: number;
    watchlist_jobs: number;
    at_risk_jobs: number;
  };
}

export function HealthDistribution({ pulse }: HealthDistributionProps) {
  const total = pulse.healthy_jobs + pulse.watchlist_jobs + pulse.at_risk_jobs;

  const getPercentage = (count: number) => {
    if (total === 0) return 0;
    return Math.round((count / total) * 100);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>📊 Job Health Distribution</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {/* Healthy Jobs */}
          <div className="space-y-2">
            <div className="flex justify-between items-center">
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full bg-green-500"></div>
                <span className="text-sm font-medium">Healthy Jobs</span>
              </div>
              <div className="text-sm font-bold">
                {pulse.healthy_jobs} ({getPercentage(pulse.healthy_jobs)}%)
              </div>
            </div>
            <div className="w-full bg-gray-200 rounded-full h-2">
              <div
                className="bg-green-500 h-2 rounded-full"
                style={{ width: `${getPercentage(pulse.healthy_jobs)}%` }}
              ></div>
            </div>
          </div>

          {/* Watchlist Jobs */}
          <div className="space-y-2">
            <div className="flex justify-between items-center">
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full bg-yellow-500"></div>
                <span className="text-sm font-medium">Watchlist Jobs</span>
              </div>
              <div className="text-sm font-bold">
                {pulse.watchlist_jobs} ({getPercentage(pulse.watchlist_jobs)}%)
              </div>
            </div>
            <div className="w-full bg-gray-200 rounded-full h-2">
              <div
                className="bg-yellow-500 h-2 rounded-full"
                style={{ width: `${getPercentage(pulse.watchlist_jobs)}%` }}
              ></div>
            </div>
          </div>

          {/* At-Risk Jobs */}
          <div className="space-y-2">
            <div className="flex justify-between items-center">
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full bg-red-500"></div>
                <span className="text-sm font-medium">At-Risk Jobs</span>
              </div>
              <div className="text-sm font-bold">
                {pulse.at_risk_jobs} ({getPercentage(pulse.at_risk_jobs)}%)
              </div>
            </div>
            <div className="w-full bg-gray-200 rounded-full h-2">
              <div
                className="bg-red-500 h-2 rounded-full"
                style={{ width: `${getPercentage(pulse.at_risk_jobs)}%` }}
              ></div>
            </div>
          </div>

          {total === 0 && (
            <div className="text-sm text-muted-foreground text-center py-4">
              No active jobs in pipeline
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}









































