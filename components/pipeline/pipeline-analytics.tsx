"use client";

import { Card } from "@/components/ui/card";

export function PipelineAnalytics({ deals }: { deals: any[] }) {
  const totalValue = deals.reduce((sum, deal) => sum + (deal.value || 0), 0);
  const activeDeals = deals.filter(
    (d) => !d.stage.startsWith("closed_")
  ).length;
  const meetings = deals.filter((d) => d.stage === "meeting").length;
  const avgProbability =
    deals.length > 0
      ? Math.round(
          deals.reduce((sum, d) => sum + (d.probability || 0), 0) / deals.length
        )
      : 0;

  // Calculate win rate (closed_won / (closed_won + closed_lost)) for last 30 days
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  
  const recentDeals = deals.filter(
    (d) => new Date(d.updated_at) >= thirtyDaysAgo
  );
  const closedWon = recentDeals.filter((d) => d.stage === "closed_won").length;
  const closedLost = recentDeals.filter((d) => d.stage === "closed_lost").length;
  const totalClosed = closedWon + closedLost;
  const winRate = totalClosed > 0 ? Math.round((closedWon / totalClosed) * 100) : 0;

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      minimumFractionDigits: 0,
    }).format(value);
  };

  return (
    <div className="grid grid-cols-1 md:grid-cols-5 gap-4 mb-6">
      <Card className="p-4">
        <div className="text-sm text-muted-foreground">Pipeline Value</div>
        <div className="text-2xl font-bold mt-1">{formatCurrency(totalValue)}</div>
      </Card>
      <Card className="p-4">
        <div className="text-sm text-muted-foreground">Active Deals</div>
        <div className="text-2xl font-bold mt-1">{activeDeals}</div>
      </Card>
      <Card className="p-4">
        <div className="text-sm text-muted-foreground">Meetings</div>
        <div className="text-2xl font-bold mt-1">{meetings}</div>
      </Card>
      <Card className="p-4">
        <div className="text-sm text-muted-foreground">Avg Close Probability</div>
        <div className="text-2xl font-bold mt-1">{avgProbability}%</div>
      </Card>
      <Card className="p-4">
        <div className="text-sm text-muted-foreground">Win Rate (30 days)</div>
        <div className="text-2xl font-bold mt-1">{winRate}%</div>
      </Card>
    </div>
  );
}









