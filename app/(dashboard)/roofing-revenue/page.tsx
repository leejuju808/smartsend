"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2 } from "lucide-react";
import { RoofingRevenueKPICards } from "./_components/RoofingRevenueKPICards";
import { RoofingKPIs } from "./_components/RoofingKPIs";
import { PipelineBreakdownChart } from "./_components/PipelineBreakdownChart";
import { RevenueForecastChart } from "./_components/RevenueForecastChart";
import { CompletedRevenueChart } from "./_components/CompletedRevenueChart";

type RoofingRevenueDashboardData = {
  cards: {
    pipelineTotal: number;
    pipelineCount: number;
    approvedClaimValue: number;
    approvedClaimCount: number;
    installReadyTotal: number;
    installReadyCount: number;
    supplementTotal: number;
    completedTotal: number;
    completedCount: number;
  };
  kpis: {
    leadsThisMonth: number;
    approvalRate: number;
    leadToInstallConversion: number;
    avgJobValue: number;
    avgTurnaroundDays: number;
    winRate: number;
  };
  pipelineBreakdown: {
    newLeads: number;
    claimFiled: number;
    adjusterScheduled: number;
    claimPending: number;
    claimApproved: number;
    installReady: number;
    scheduled: number;
    inProgress: number;
    completed: number;
  };
  revenueForecast: Array<{
    date: string;
    revenue: number;
  }>;
  completedRevenue: Array<{
    date: string;
    revenue: number;
  }>;
};

export default function RoofingRevenueDashboardPage() {
  const [data, setData] = useState<RoofingRevenueDashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      setError(null);
      
      try {
        const response = await fetch("/api/revenue/roofing-dashboard");
        if (!response.ok) {
          throw new Error("Failed to fetch roofing revenue data");
        }
        const result = await response.json();
        
        if (result.ok && result.data) {
          setData(result.data);
        } else {
          throw new Error(result.error || "Failed to load data");
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load data");
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6">
        <Card>
          <CardContent className="pt-6">
            <div className="text-center text-red-600">{error}</div>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!data) {
    return null;
  }

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">
          SmartSend Roofing Revenue Dashboard
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Your money scoreboard — see exactly how much revenue is in your pipeline
        </p>
      </div>

      {/* KPI Cards */}
      <RoofingRevenueKPICards cards={data.cards} />

      {/* KPI Stats */}
      <RoofingKPIs kpis={data.kpis} />

      {/* Charts Grid */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Pipeline Breakdown */}
        <Card>
          <CardHeader>
            <CardTitle>📦 Pipeline Breakdown</CardTitle>
          </CardHeader>
          <CardContent>
            <PipelineBreakdownChart breakdown={data.pipelineBreakdown} />
          </CardContent>
        </Card>

        {/* Revenue Forecast */}
        <Card>
          <CardHeader>
            <CardTitle>📅 Revenue Forecast</CardTitle>
          </CardHeader>
          <CardContent>
            <RevenueForecastChart data={data.revenueForecast} />
          </CardContent>
        </Card>
      </div>

      {/* Completed Revenue */}
      <Card>
        <CardHeader>
          <CardTitle>✔️ Completed Jobs</CardTitle>
        </CardHeader>
        <CardContent>
          <CompletedRevenueChart data={data.completedRevenue} />
        </CardContent>
      </Card>
    </div>
  );
}
















































