"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DollarSign, Users, TrendingUp, Percent, FileText } from "lucide-react";

type KPIs = {
  jobsWon: number;
  revenueWon: number;
  avgJobValue: number | null;
  leads: number;
  inspections: number;
  estimates: number;
  closeRateEstimates: number;
  closeRateLeads: number;
  pipelineValue: {
    estimateTotal: number;
    jobsWonFuture: number;
  };
};

const formatCurrency = (amount: number) => {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
};

export function RevenueKPICards({ kpis }: { kpis: KPIs }) {
  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
      {/* Revenue Won */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Revenue Won</CardTitle>
          <DollarSign className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">{formatCurrency(kpis.revenueWon)}</div>
          {kpis.avgJobValue && (
            <p className="text-xs text-muted-foreground mt-1">
              Avg: {formatCurrency(kpis.avgJobValue)}/job
            </p>
          )}
        </CardContent>
      </Card>

      {/* Jobs Won */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Jobs Won</CardTitle>
          <TrendingUp className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">{kpis.jobsWon}</div>
          <p className="text-xs text-muted-foreground mt-1">
            {kpis.estimates > 0
              ? `${kpis.closeRateEstimates.toFixed(1)}% close rate`
              : "No estimates sent"}
          </p>
        </CardContent>
      </Card>

      {/* Close Rate */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Close Rate</CardTitle>
          <Percent className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">
            {kpis.closeRateEstimates > 0 ? `${kpis.closeRateEstimates.toFixed(1)}%` : "0%"}
          </div>
          <p className="text-xs text-muted-foreground mt-1">
            Jobs Won / Estimates Sent
          </p>
        </CardContent>
      </Card>

      {/* Leads Created */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Leads Created</CardTitle>
          <Users className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">{kpis.leads}</div>
          <p className="text-xs text-muted-foreground mt-1">
            {kpis.inspections} inspections • {kpis.estimates} estimates
          </p>
        </CardContent>
      </Card>

      {/* Pipeline Value */}
      <Card className="md:col-span-2 lg:col-span-4">
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Pipeline Value</CardTitle>
          <FileText className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <div className="text-sm text-muted-foreground">Estimate Total</div>
              <div className="text-xl font-bold">{formatCurrency(kpis.pipelineValue.estimateTotal)}</div>
            </div>
            <div>
              <div className="text-sm text-muted-foreground">Jobs Won (Future)</div>
              <div className="text-xl font-bold">{formatCurrency(kpis.pipelineValue.jobsWonFuture)}</div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}




























































