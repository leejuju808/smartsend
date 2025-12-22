"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DollarSign, CheckCircle2, Zap, TrendingUp, CheckSquare } from "lucide-react";

type RoofingRevenueCards = {
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

const formatCurrency = (amount: number) => {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
};

export function RoofingRevenueKPICards({ cards }: { cards: RoofingRevenueCards }) {
  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
      {/* A) Total Pipeline Value */}
      <Card className="lg:col-span-1">
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">💰 Pipeline Value</CardTitle>
          <DollarSign className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">{formatCurrency(cards.pipelineTotal)}</div>
          <p className="text-xs text-muted-foreground mt-1">
            {cards.pipelineCount} active jobs
          </p>
        </CardContent>
      </Card>

      {/* B) Approved Claim Value */}
      <Card className="lg:col-span-1">
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">✔️ Approved Claims</CardTitle>
          <CheckCircle2 className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">{formatCurrency(cards.approvedClaimValue)}</div>
          <p className="text-xs text-muted-foreground mt-1">
            {cards.approvedClaimCount} roofs ready for install
          </p>
        </CardContent>
      </Card>

      {/* C) Install-Ready Revenue */}
      <Card className="lg:col-span-1">
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">🔥 Install-Ready</CardTitle>
          <Zap className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">{formatCurrency(cards.installReadyTotal)}</div>
          <p className="text-xs text-muted-foreground mt-1">
            {cards.installReadyCount} ready to close
          </p>
        </CardContent>
      </Card>

      {/* D) Supplement Opportunity Value */}
      <Card className="lg:col-span-1">
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">📈 Supplement Upside</CardTitle>
          <TrendingUp className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">{formatCurrency(cards.supplementTotal)}</div>
          <p className="text-xs text-muted-foreground mt-1">
            Unpaid items from insurance
          </p>
        </CardContent>
      </Card>

      {/* E) Completed Revenue (Last 30 Days) */}
      <Card className="lg:col-span-1">
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">🏁 Completed (30 Days)</CardTitle>
          <CheckSquare className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">{formatCurrency(cards.completedTotal)}</div>
          <p className="text-xs text-muted-foreground mt-1">
            {cards.completedCount} completed installs
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
















































