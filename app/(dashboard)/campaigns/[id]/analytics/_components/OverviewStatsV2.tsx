"use client";

import { Card, CardContent } from "@/components/ui/card";
import { CampaignAnalytics } from "../types";
import { TrendingUp, TrendingDown } from "lucide-react";

interface OverviewStatsV2Props {
  summary: CampaignAnalytics["summary"];
  comparison?: CampaignAnalytics["comparison"];
}

export function OverviewStatsV2({ summary, comparison }: OverviewStatsV2Props) {
  const formatNumber = (num: number) => {
    return new Intl.NumberFormat("en-US").format(num);
  };

  const formatCurrency = (num: number) => {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(num);
  };

  const formatPercent = (num: number) => {
    return `${num >= 0 ? "+" : ""}${num.toFixed(1)}%`;
  };

  const stats = [
    {
      label: "🔥 Hot Leads",
      value: formatNumber(summary.uniqueHotLeads),
      subtitle: `${summary.hotRate.toFixed(1)}% hot rate`,
      color: "text-red-600",
      icon: "🔥",
      trend: comparison?.hotLeadRateChange,
    },
    {
      label: "🌡️ Warm Leads",
      value: formatNumber(summary.warmLeads),
      subtitle: `${summary.warmRate.toFixed(1)}% warm rate`,
      color: "text-orange-600",
      icon: "🌡️",
    },
    {
      label: "💬 Replies",
      value: formatNumber(summary.replies),
      subtitle: `${summary.replyRate.toFixed(1)}% reply rate`,
      color: "text-green-600",
      icon: "💬",
      trend: comparison?.replyRateChange,
    },
    {
      label: "📩 Emails Delivered",
      value: formatNumber(summary.delivered),
      subtitle: `${formatNumber(summary.totalContacts)} contacts targeted`,
      color: "text-blue-600",
      icon: "📩",
    },
    {
      label: "📘 Estimates Booked",
      value: formatNumber(summary.estimateRequests),
      subtitle: `${summary.delivered > 0 ? ((summary.estimateRequests / summary.delivered) * 100).toFixed(1) : 0}% booking rate`,
      color: "text-purple-600",
      icon: "📘",
    },
    {
      label: "💰 Estimated Revenue",
      value: formatCurrency(summary.estimatedRevenue),
      subtitle: `${summary.jobsWon} jobs won`,
      color: "text-emerald-600",
      icon: "💰",
      trend: comparison?.estimatedRevenueChange,
    },
  ];

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
      {stats.map((stat) => (
        <Card key={stat.label} className="rounded-lg">
          <CardContent className="p-6">
            <div className="flex items-start justify-between mb-2">
              <p className="text-sm font-medium text-muted-foreground">
                {stat.label}
              </p>
              {stat.trend !== undefined && (
                <div
                  className={`flex items-center gap-1 text-xs ${
                    stat.trend >= 0 ? "text-green-600" : "text-red-600"
                  }`}
                >
                  {stat.trend >= 0 ? (
                    <TrendingUp className="h-3 w-3" />
                  ) : (
                    <TrendingDown className="h-3 w-3" />
                  )}
                  <span>{formatPercent(stat.trend)}</span>
                </div>
              )}
            </div>
            <p className={`text-2xl font-bold ${stat.color} mb-1`}>
              {stat.value}
            </p>
            <p className="text-xs text-muted-foreground">{stat.subtitle}</p>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

