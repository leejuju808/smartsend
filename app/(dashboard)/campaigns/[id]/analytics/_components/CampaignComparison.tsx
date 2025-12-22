"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CampaignAnalytics } from "../types";
import { TrendingUp, TrendingDown } from "lucide-react";

interface CampaignComparisonProps {
  comparison?: CampaignAnalytics["comparison"];
}

export function CampaignComparison({ comparison }: CampaignComparisonProps) {
  if (!comparison) {
    return null;
  }

  const formatPercent = (num: number) => {
    return `${num >= 0 ? "+" : ""}${num.toFixed(1)}%`;
  };

  const formatCurrency = (num: number) => {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(num);
  };

  const metrics = [
    {
      label: "Reply Rate",
      value: formatPercent(comparison.replyRateChange),
      isPositive: comparison.replyRateChange >= 0,
    },
    {
      label: "Hot Lead Rate",
      value: formatPercent(comparison.hotLeadRateChange),
      isPositive: comparison.hotLeadRateChange >= 0,
    },
    {
      label: "Estimated Revenue",
      value: formatCurrency(comparison.estimatedRevenueChange),
      isPositive: comparison.estimatedRevenueChange >= 0,
    },
  ];

  return (
    <Card className="rounded-lg">
      <CardHeader>
        <CardTitle>Compared to Your Last Campaign</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {metrics.map((metric) => (
            <div
              key={metric.label}
              className="flex items-center justify-between p-3 rounded-lg bg-muted/50"
            >
              <span className="text-sm font-medium">{metric.label}</span>
              <div
                className={`flex items-center gap-2 ${
                  metric.isPositive ? "text-green-600" : "text-red-600"
                }`}
              >
                {metric.isPositive ? (
                  <TrendingUp className="h-4 w-4" />
                ) : (
                  <TrendingDown className="h-4 w-4" />
                )}
                <span className="font-semibold">{metric.value}</span>
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

