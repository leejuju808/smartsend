"use client";

import { Card, CardContent } from "@/components/ui/card";
import { CampaignAnalytics } from "../types";

interface SummaryStatsProps {
  summary: CampaignAnalytics["summary"];
}

export function SummaryStats({ summary }: SummaryStatsProps) {
  const formatNumber = (num: number) => {
    return new Intl.NumberFormat("en-US").format(num);
  };

  const formatPercent = (num: number) => {
    return `${num.toFixed(1)}%`;
  };

  const stats = [
    {
      label: "Homeowners contacted",
      value: formatNumber(summary.delivered),
      subtitle: `${formatNumber(summary.totalContacts)} contacts targeted`,
      color: "text-blue-600",
    },
    {
      label: "Homeowners responding",
      value: formatNumber(summary.replies),
      subtitle: `${formatPercent(summary.replyRate)} homeowners responding`,
      color: "text-green-600",
    },
    {
      label: "HOT Leads",
      value: formatNumber(summary.uniqueHotLeads),
      subtitle: `${formatPercent(summary.hotRate)} hot rate`,
      color: "text-red-600",
    },
    {
      label: "WARM Leads",
      value: formatNumber(summary.warmLeads),
      subtitle: `${formatPercent(summary.warmRate)} warm rate`,
      color: "text-orange-600",
    },
  ];

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {stats.map((stat) => (
        <Card key={stat.label} className="rounded-lg">
          <CardContent className="p-6">
            <p className="text-sm font-medium text-muted-foreground mb-1">
              {stat.label}
            </p>
            <p className={`text-3xl font-bold ${stat.color} mb-1`}>
              {stat.value}
            </p>
            <p className="text-xs text-muted-foreground">{stat.subtitle}</p>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}





























































