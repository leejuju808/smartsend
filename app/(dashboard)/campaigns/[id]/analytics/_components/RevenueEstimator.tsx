"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CampaignAnalytics } from "../types";
import { useState, useEffect } from "react";

interface RevenueEstimatorProps {
  summary: CampaignAnalytics["summary"];
  jobsWon: number;
}

export function RevenueEstimator({ summary, jobsWon }: RevenueEstimatorProps) {
  const [averageJobValue, setAverageJobValue] = useState<number>(12700);
  const [averageRepairValue, setAverageRepairValue] = useState<number>(850);
  const [estimatedRevenue, setEstimatedRevenue] = useState<number>(0);

  useEffect(() => {
    // Calculate estimated revenue based on jobs won and average values
    // For now, use averageJobValue for all jobs
    // In a full implementation, you might want to differentiate between jobs and repairs
    const revenue = jobsWon * averageJobValue;
    setEstimatedRevenue(revenue);
  }, [jobsWon, averageJobValue, averageRepairValue]);

  const formatCurrency = (num: number) => {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(num);
  };

  return (
    <Card className="rounded-lg">
      <CardHeader>
        <CardTitle>Revenue Estimator</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="averageJobValue">Average Job Value</Label>
          <Input
            id="averageJobValue"
            type="number"
            value={averageJobValue}
            onChange={(e) => setAverageJobValue(Number(e.target.value))}
            placeholder="12700"
          />
          <p className="text-xs text-muted-foreground">
            Example: Average roof replacement = $12,700
          </p>
        </div>

        <div className="space-y-2">
          <Label htmlFor="averageRepairValue">Average Repair Value</Label>
          <Input
            id="averageRepairValue"
            type="number"
            value={averageRepairValue}
            onChange={(e) => setAverageRepairValue(Number(e.target.value))}
            placeholder="850"
          />
          <p className="text-xs text-muted-foreground">
            Example: Average repair = $850
          </p>
        </div>

        <div className="pt-4 border-t space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">Jobs Won</span>
            <span className="font-semibold">{jobsWon}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">Estimated Revenue</span>
            <span className="text-2xl font-bold text-emerald-600">
              {formatCurrency(estimatedRevenue)}
            </span>
          </div>
          {summary.estimatedRevenue > 0 && (
            <div className="pt-2 border-t">
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Actual Revenue</span>
                <span className="font-semibold text-emerald-600">
                  {formatCurrency(summary.estimatedRevenue)}
                </span>
              </div>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

