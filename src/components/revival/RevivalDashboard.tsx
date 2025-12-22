"use client";

// Block 35333 — Revival Dashboard Component
// Shows key metrics for dead lead revival system

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { TrendingUp, TrendingDown, Users, DollarSign, MessageSquare, Target } from "lucide-react";
import useSWR from "swr";

const fetcher = (url: string) => fetch(url).then((res) => res.json());

interface RevivalMetrics {
  deadLeadsCount: number;
  revivedLeadsCount: number;
  revivedThisMonth: number;
  highPotentialLeads: number;
  revivalMessagesSentThisMonth: number;
  revivalRepliesThisMonth: number;
  conversionRate: number;
}

interface RevivalDashboardProps {
  workspaceId: string;
}

export function RevivalDashboard({ workspaceId }: RevivalDashboardProps) {
  const { data, error, isLoading, mutate } = useSWR<RevivalMetrics>(
    `/api/revival/metrics?workspace_id=${workspaceId}`,
    fetcher,
    {
      refreshInterval: 30000, // Refresh every 30 seconds
    }
  );

  if (isLoading) {
    return (
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {[...Array(6)].map((_, i) => (
          <Card key={i}>
            <CardHeader className="pb-2">
              <div className="h-4 w-24 bg-gray-200 rounded animate-pulse" />
            </CardHeader>
            <CardContent>
              <div className="h-8 w-16 bg-gray-200 rounded animate-pulse" />
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <Card>
        <CardContent className="pt-6">
          <p className="text-sm text-red-600">Error loading revival metrics</p>
        </CardContent>
      </Card>
    );
  }

  const metrics = data || {
    deadLeadsCount: 0,
    revivedLeadsCount: 0,
    revivedThisMonth: 0,
    highPotentialLeads: 0,
    revivalMessagesSentThisMonth: 0,
    revivalRepliesThisMonth: 0,
    conversionRate: 0,
  };

  const cards = [
    {
      title: "Dead Leads",
      value: metrics.deadLeadsCount.toLocaleString(),
      icon: Users,
      description: "Leads with no activity for 30+ days",
      trend: null,
    },
    {
      title: "Leads Revived This Month",
      value: metrics.revivedThisMonth.toLocaleString(),
      icon: TrendingUp,
      description: "Dead leads brought back to life",
      trend: "positive",
    },
    {
      title: "High Potential Leads",
      value: metrics.highPotentialLeads.toLocaleString(),
      icon: Target,
      description: "Dead leads with revival score ≥ 60",
      trend: null,
    },
    {
      title: "Revival Messages Sent",
      value: metrics.revivalMessagesSentThisMonth.toLocaleString(),
      icon: MessageSquare,
      description: "Messages sent this month",
      trend: null,
    },
    {
      title: "Revival Replies",
      value: metrics.revivalRepliesThisMonth.toLocaleString(),
      icon: MessageSquare,
      description: "Homeowners who replied",
      trend: "positive",
    },
    {
      title: "Conversion Rate",
      value: `${metrics.conversionRate.toFixed(1)}%`,
      icon: DollarSign,
      description: "Reply rate on revival messages",
      trend: metrics.conversionRate > 10 ? "positive" : metrics.conversionRate > 5 ? "neutral" : "negative",
    },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold tracking-tight">Revival Engine</h2>
        <p className="text-muted-foreground">
          Track and recover dead leads automatically
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {cards.map((card) => (
          <Card key={card.title}>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">{card.title}</CardTitle>
              <card.icon className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="flex items-baseline gap-2">
                <div className="text-2xl font-bold">{card.value}</div>
                {card.trend === "positive" && (
                  <TrendingUp className="h-4 w-4 text-green-600" />
                )}
                {card.trend === "negative" && (
                  <TrendingDown className="h-4 w-4 text-red-600" />
                )}
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                {card.description}
              </p>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Revival Summary</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Total Revived (All Time)</span>
              <span className="font-semibold">{metrics.revivedLeadsCount.toLocaleString()}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Revenue Recovery Potential</span>
              <span className="font-semibold">
                {metrics.highPotentialLeads > 0 ? "High" : "Low"}
              </span>
            </div>
            <div className="pt-2 border-t">
              <p className="text-xs text-muted-foreground">
                The revival engine automatically detects dead leads and sends personalized
                messages to bring them back. High potential leads have a revival score of 60+
                and are prioritized for outreach.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
































