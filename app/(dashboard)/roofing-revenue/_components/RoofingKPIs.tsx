"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Users, Percent, TrendingUp, DollarSign, Clock, Target } from "lucide-react";

type RoofingKPIs = {
  leadsThisMonth: number;
  approvalRate: number;
  leadToInstallConversion: number;
  avgJobValue: number;
  avgTurnaroundDays: number;
  winRate: number;
};

export function RoofingKPIs({ kpis }: { kpis: RoofingKPIs }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>📊 KPIs</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {/* Leads This Month */}
          <div className="flex items-center gap-3">
            <Users className="h-5 w-5 text-muted-foreground" />
            <div>
              <div className="text-sm text-muted-foreground">Leads This Month</div>
              <div className="text-xl font-semibold">{kpis.leadsThisMonth}</div>
            </div>
          </div>

          {/* Approval Rate */}
          <div className="flex items-center gap-3">
            <Percent className="h-5 w-5 text-muted-foreground" />
            <div>
              <div className="text-sm text-muted-foreground">Claim Approval Rate</div>
              <div className="text-xl font-semibold">{kpis.approvalRate.toFixed(1)}%</div>
            </div>
          </div>

          {/* Lead → Install Conversion */}
          <div className="flex items-center gap-3">
            <TrendingUp className="h-5 w-5 text-muted-foreground" />
            <div>
              <div className="text-sm text-muted-foreground">Lead → Install Conversion</div>
              <div className="text-xl font-semibold">{kpis.leadToInstallConversion.toFixed(1)}%</div>
            </div>
          </div>

          {/* Average Job Value */}
          <div className="flex items-center gap-3">
            <DollarSign className="h-5 w-5 text-muted-foreground" />
            <div>
              <div className="text-sm text-muted-foreground">Avg Job Value</div>
              <div className="text-xl font-semibold">
                {new Intl.NumberFormat("en-US", {
                  style: "currency",
                  currency: "USD",
                  minimumFractionDigits: 0,
                  maximumFractionDigits: 0,
                }).format(kpis.avgJobValue)}
              </div>
            </div>
          </div>

          {/* Average Turnaround */}
          <div className="flex items-center gap-3">
            <Clock className="h-5 w-5 text-muted-foreground" />
            <div>
              <div className="text-sm text-muted-foreground">Avg Turnaround</div>
              <div className="text-xl font-semibold">{kpis.avgTurnaroundDays.toFixed(0)} days</div>
            </div>
          </div>

          {/* Win Rate */}
          <div className="flex items-center gap-3">
            <Target className="h-5 w-5 text-muted-foreground" />
            <div>
              <div className="text-sm text-muted-foreground">Win Rate</div>
              <div className="text-xl font-semibold">{kpis.winRate.toFixed(1)}%</div>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
















































